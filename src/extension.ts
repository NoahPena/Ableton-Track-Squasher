import { initialize, type ActivationContext } from "@ableton-extensions/sdk";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  const { tempo } = context.application.song;
  console.log(
    `Hello from track-squasher! Your Live Set's tempo is: ${tempo} bpm.`,
  );

  context.ui.registerContextMenuAction(
    "AudioTrack.ArrangementSelection", // The scope
    "Process Audio", // The label shown to the user
    "my-extension.process-audio" // The ID of the command to trigger
  );

  context.commands.registerCommand("my-extension.process-audio", (arg) => {
    squashAudio(arg);
  });
}

function squashAudio(arg: unknown) {
  console.log("Squashing audio with argument:", arg);
}