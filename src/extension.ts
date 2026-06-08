import { ApiVersion, ArrangementSelection, AudioTrack, DataModelObject, ExtensionContext, Handle, initialize, MidiTrack, type ActivationContext } from "@ableton-extensions/sdk";
const os = require('os');
// Yea yea fluent-ffmpeg is depecrated, but it works
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require('ffmpeg-static');
// let ffmpegPath = __dirname;

// if (os.platform() === "win32") {
//     ffmpegPath += "/../ffmpeg_binaries/ffmpeg.exe";
// } else if (os.platform() === "darwin" && os.arch() === "arm64") {
//     ffmpegPath += "/../ffmpeg_binaries/ffmpeg_macos_arm64";
// } else if (os.platform() === "darwin") {
//     ffmpegPath += "/../ffmpeg_binaries/ffmpeg_macos_x64";
// } else {
//     console.error("Unsupported platform or architecture");
//     ffmpegPath = ""; // Set to empty string to avoid errors, but this will cause ffmpeg to fail when trying to run
// }

// tempDirectory doesn't seem to work when testing so we'll just
// use the current directory as the tempDirectory when debugging
const debugOutputDirectory = __dirname;

console.log(`Using ffmpeg from path: ${ffmpegPath}`);
ffmpeg.setFfmpegPath(ffmpegPath);

const apiVersion: ApiVersion = "1.0.0";

export function activate(activation: ActivationContext) {
    const context = initialize(activation, apiVersion);

    context.ui.registerContextMenuAction(
        "AudioTrack.ArrangementSelection", // The scope
        "Process Audio", // The label shown to the user
        "my-extension.process-audio" // The ID of the command to trigger
    );

    context.commands.registerCommand("my-extension.process-audio", async (arg) => {
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
    });
}

async function processAudioTrack(context: ExtensionContext<typeof apiVersion>, track: AudioTrack<typeof apiVersion>, startTime: number, endTime: number): Promise<string> {
    
    console.log(`Processing audio track: ${track.name} from ${startTime} to ${endTime}`);

    // Currently only rendering PreFX Audio because the Ableton Extensions SDK doesn't allow for
    // rendering PostFX Audio. If it gets added in the future, then we'll show an dialogBox
    // to ask the user if they want to render PreFX or PostFX audio.
    const filePath = await context.resources.renderPreFxAudio(track, startTime, endTime);

    return filePath;
}

function processMidiTrack(context: ExtensionContext<typeof apiVersion>, track: MidiTrack<typeof apiVersion>, startTime: number, endTime: number) {
    
    // The Ableton Extensions SDK doesn't currently allow for rendering MIDI tracks to audio, so we'll just log the MIDI track names for now. 
    // If MIDI rendering gets added in the future, then we can implement that here.
    console.log(`Processing MIDI track: ${track.name} from ${startTime} to ${endTime}`);
}

function mergeAudioFiles(filePaths: string[], outputPath: string) {
    
    // I tried to see if there was a way to merge audio files
    // without downloading ffmpeg, but I couldn't get any of the
    // libraries to work so ffmpeg it is!
    let ffmpegObj = ffmpeg();
    
    for (const filePath of filePaths) {
        ffmpegObj.input(filePath);
    }

    ffmpegObj.complexFilter([
        `[0:a][1:a]amix=inputs=${filePaths.length}:duration=longest[outa]`
    ]);

    ffmpegObj.map('[outa]');

    ffmpegObj.output(outputPath);

    ffmpegObj.on('end', () => {
        console.log(`Merged audio saved to: ${outputPath}`);
    });

    ffmpegObj.on('error', (err: any) => {
        console.error('Error merging audio files:', err);
    });

    ffmpegObj.run();
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