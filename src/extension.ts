import { ApiVersion, ArrangementSelection, AudioTrack, DataModelObject, ExtensionContext, Handle, initialize, MidiTrack, type ActivationContext } from "@ableton-extensions/sdk";
import path from "path";

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require('ffmpeg-static');


console.log(`Using ffmpeg from path: ${ffmpegPath}`);
ffmpeg.setFfmpegPath(ffmpegPath);

const apiVersion: ApiVersion = "1.0.0";

export function activate(activation: ActivationContext) {
    const context = initialize(activation, apiVersion);

    const { tempo } = context.application.song;
    console.log(
        `Hello from track-squasher! Your Live Set's tempo is: ${tempo} bpm.`,
    );

    context.ui.registerContextMenuAction(
        "AudioTrack.ArrangementSelection", // The scope
        "Process Audio", // The label shown to the user
        "my-extension.process-audio" // The ID of the command to trigger
    );

    context.commands.registerCommand("my-extension.process-audio", async (arg) => {
        const selection = arg as ArrangementSelection;
        const startTime = selection.time_selection_start;
        const endTime = selection.time_selection_end;

        let filesProcessed: string[] = [];
        let promises: Promise<string>[] = [];

        for (const lane of selection.selected_lanes) {
            const handle: Handle = { id: lane.id};
            const obj = context.getObjectFromHandle(handle, DataModelObject);

            if (obj instanceof AudioTrack) {
                await processAudioTrack(context, obj, startTime, endTime);
                // const promise = processAudioTrack(context, obj, startTime, endTime);
                // promises.push(promise);
            } else if (obj instanceof MidiTrack) {
                processMidiTrack(context, obj, startTime, endTime);
            } else {
                console.log(`Selected lane is not an audio or MIDI track: ${obj}`);
            }
        }

        // const results = await Promise.allSettled(promises);

        // results.forEach(result => {
        //     if (result.status === "fulfilled") {
        //         filesProcessed.push(result.value);
        //     } else {
        //         console.error("Error processing track:", result.reason);
        //     }
        // });

        const timestamp = Date.now();

        const outputPath = context.environment.tempDirectory + `/squashed_audio_${timestamp}.wav`;

        mergeAudioFiles(filesProcessed, outputPath);

        
        
        squashAudio(arg);
    });
}

async function processAudioTrack(context: ExtensionContext<typeof apiVersion>, track: AudioTrack<typeof apiVersion>, startTime: number, endTime: number): Promise<string> {
    console.log(`Processing audio track: ${track.name} from ${startTime} to ${endTime}`);
    // Here you would add your audio processing logic, such as applying effects or modifying the clip.

    const filePath = await context.resources.renderPreFxAudio(track, startTime, endTime);

    return filePath;
}

function processMidiTrack(context: ExtensionContext<typeof apiVersion>, track: MidiTrack<typeof apiVersion>, startTime: number, endTime: number) {
    console.log(`Processing MIDI track: ${track.name} from ${startTime} to ${endTime}`);
    // Here you would add your MIDI processing logic, such as quantizing notes or changing velocities.
}

function mergeAudioFiles(filePaths: string[], outputPath: string) {
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

function squashAudio(arg: unknown) {
    console.log("Squashing audio with argument:", arg);
}