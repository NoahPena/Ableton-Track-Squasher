import { ApiVersion, ArrangementSelection, AudioTrack, DataModelObject, ExtensionContext, Handle, initialize, MidiTrack, type ActivationContext } from "@ableton-extensions/sdk";
import fs from "fs";
import { parseWavHeader, readSample, writeSample, writeWavHeader } from "./wav.js";

// tempDirectory doesn't seem to work when testing so we'll just
// use the current directory as the tempDirectory when debugging
const debugOutputDirectory = __dirname;

const apiVersion: ApiVersion = "1.0.0";

export function activate(activation: ActivationContext) {
    const context = initialize(activation, apiVersion);

    context.ui.registerContextMenuAction(
        "AudioTrack.ArrangementSelection", // The scope
        "Merge Audio", // The label shown to the user
        "audio-merger.merge-arragement-selection-audio" // The ID of the command to trigger
    );

    context.commands.registerCommand("audio-merger.merge-arragement-selection-audio", async (arg) => {
        const selection = arg as ArrangementSelection;
        const startTime = selection.time_selection_start;
        const endTime = selection.time_selection_end;
        const duration = endTime - startTime;
        const outputDirectory = context.environment.tempDirectory ?? debugOutputDirectory;

        let filesProcessed: string[] = [];

        // Go through and create audio files for each selected track
        for (const lane of selection.selected_lanes) {
            const handle: Handle = { id: lane.id};
            const obj = context.getObjectFromHandle(handle, DataModelObject);

            if (obj instanceof AudioTrack) {
                filesProcessed.push(await processAudioTrack(context, obj, startTime, endTime));
            } else if (obj instanceof MidiTrack) {
                processMidiTrack(context, obj, startTime, endTime);
            } else {
                console.log(`Selected lane is not an audio or MIDI track, but instead some secret 3rd thing...: ${obj}`);
            }
        }

        console.log("Number of audio files processed:", filesProcessed.length);

        // Need a unique name for each file so timestamp is always a safe bet
        const timestamp = Date.now();
        const outputPath = outputDirectory + `/merged_audio_${timestamp}.wav`;

        mergeAudioFiles(filesProcessed, outputPath);

        createNewTrackWithAudio(context, outputPath, startTime, duration);

        muteOtherTrackSelections(context, selection, startTime, duration, filesProcessed);
    });
}

async function processAudioTrack(context: ExtensionContext<typeof apiVersion>, track: AudioTrack<typeof apiVersion>, startTime: number, endTime: number): Promise<string> {
    
    console.log(`Processing audio track: ${track.name} from ${startTime} to ${endTime}`);

    // Currently only rendering PreFX Audio because the Ableton Extensions SDK doesn't allow for
    // rendering PostFX Audio. If it gets added in the future, then we'll show an dialogBox
    // to ask the user if they want to render PreFX or PostFX audio.
    const filePath = await context.resources.renderPreFxAudio(track, startTime, endTime);

    console.log(`Rendered audio file for track ${track.name} saved to: ${filePath}`);

    return filePath;
}

function processMidiTrack(context: ExtensionContext<typeof apiVersion>, track: MidiTrack<typeof apiVersion>, startTime: number, endTime: number) {
    
    // The Ableton Extensions SDK doesn't currently allow for rendering MIDI tracks to audio, so we'll just log the MIDI track names for now. 
    // If MIDI rendering gets added in the future, then we can implement that here.
    console.log(`Processing MIDI track: ${track.name} from ${startTime} to ${endTime}`);
}

function mergeAudioFiles(filePaths: string[], outputPath: string) {

    // Load All the Wav files
    let waveFiles = [];

    for (const filePath of filePaths) {
        let wav = fs.readFileSync(filePath).buffer;
        waveFiles.push(wav);
    }

    // Get the headers of each wav file
    const headers = waveFiles.map(parseWavHeader);

    // The merged file is gonna be the same length as the largest audio file
    // so we need to figure out what the length is. 
    const bytesPerSample = headers[0].bitDepth / 8;
    const maxDataBytes = Math.max(...headers.map((h) => h.dataSize));
    const totalSamples = maxDataBytes / bytesPerSample;

    // Merging the audio files essentially means taking all the samples and adding them
    // all up. This can potentially cause clipping but we'll handle that afterwards.
    const mixed = new Float64Array(totalSamples);

    for (let i = 0; i < waveFiles.length; i++) {
        const view = new DataView(waveFiles[i]);
        const numSamples = headers[i].dataSize / bytesPerSample;

        for (let j = 0; j < numSamples; j++)
        {
            const byteOffset = headers[i].dataOffset + j * bytesPerSample;
            mixed[j] += readSample(view, byteOffset, headers[i].bitDepth);
        }
    }

    // With everything added up we need to check for clipping and normalize the sample if it is occuring
    // Basically we check if any of the samples are greater than the SIGNED_MAX of our bitDepth
    // or smaller than the -SIGNED_MAX of our bitDepth
    
    // Basically SIGNED_MAX and -SIGNED_MAX depending on our bitDepth
    const maxVal = (1 << (headers[0].bitDepth - 1)) - 1;
    const minVal = (-maxVal - 1);

    let peak = 0;
    for (let i = 0; i < totalSamples; i++) {
        const abs = Math.abs(mixed[i]);
        if (abs > peak)
        {
            peak = abs;
        }
    }

    const needToNormalize = peak > maxVal;
    const scale = needToNormalize ? maxVal / peak : 1;

    // Will all that, we're ready to create a new buffer for the .wav file
    const outputDataBytes = totalSamples * bytesPerSample;

    // 44 bytes is the .wav file header length for PCM Header
    const outputBuffer = new ArrayBuffer(44 + outputDataBytes);
    const out = new DataView(outputBuffer);

    writeWavHeader(out, {
        numChannels: headers[0].numChannels,
        sampleRate: headers[0].sampleRate,
        bitsPerSample: headers[0].bitDepth,
        dataSize: outputDataBytes,
    });

    // Now that the header is in, we need to write each sample to the buffer, but also
    // taking into account if we need to normalize the samples. If we do, then we'll apply 
    // our scale factor, otherwise the scale factor will just be 1
    for (let i = 0; i < totalSamples; i++) {
        const sample = Math.round(mixed[i] * scale);
        const clamped = Math.max(minVal, Math.min(maxVal, sample));
        writeSample(out, 44 + i * bytesPerSample, clamped, headers[0].bitDepth);
    }
    
    // Ok buffer is all written so now we can actually create the file from the buffer
    fs.writeFileSync(outputPath, new Uint8Array(outputBuffer));
}

async function createNewTrackWithAudio(context: ExtensionContext<typeof apiVersion>, audioFilePath: string, startTime: number, duration: number) {

    console.log(`Creating new track with audio file: ${audioFilePath}`);

    await context.application.song.createAudioTrack().then((newTrack) => {
        console.log(`Created new track: ${newTrack.name}`);
        newTrack.createAudioClip({
            filePath: audioFilePath,
            startTime: startTime,
            duration: duration
        });
    }).catch((error) => {
        console.error('Error creating new track:', error);
    });
}

async function muteOtherTrackSelections(context: ExtensionContext<"1.0.0">, selection: ArrangementSelection, startTime: number, duration: number, files: string[]) {
    
    let i = 0; 

    console.log('Muting the clips that we just merged');

    // So... There might be a better way to do this, but I couldn't figure out for the life of me.
    // The way that I found to mute sections of a clip is to just create a clip over that clip, and
    // then mute it. It seems kinda janky but it does work!
    for (const lane of selection.selected_lanes) {
        const handle: Handle = { id: lane.id};
        const obj = context.getObjectFromHandle(handle, DataModelObject);

        if (obj instanceof AudioTrack) {
            await obj.createAudioClip({
                filePath: files[i],
                startTime: startTime,
                duration: duration
            }).then((clip) => {
                clip.muted = true;
            });
        } else if (obj instanceof MidiTrack) {
            // Midi Tracks aren't supported yet so just skip
        } else {
            console.log(`Selected lane is not an audio or MIDI track, but instead some secret 3rd thing...: ${obj}`);
        }

        i++;
    }
}
