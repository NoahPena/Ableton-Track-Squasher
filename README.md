<br />
<div align="center">

# Audio Merger - Ableton  Live Extension

Audio Merger is an Ableton Live Extension that can merge all audio within an Arrangement Audio Selection into a single file on a new Track.

![](https://github.com/NoahPena/Ableton-Audio-Merger/blob/main/low-audio-merger.gif)

</div>

## What It Does

Audio Merger takes an arrangement selection and merges(mixes) the audio into a single .wav file. This .wav file is then placed onto a new track, and the arrangement selection is then muted.

This is functionally the same as doing an export of the selected tracks or resampling the selected tracks, but in a quicker way.

## Limitations

There are a couple limitations due to limitations with the Ableton Extension SDK. Namely:

* Audio Merger only merges Pre-FX Audio since there is no way to render Post-FX Audio
* MIDI Clips are not supported because there is no way to bounce a MIDI Track to an Audio Clip
    * Any MIDI Clips selected are just skipped

## How To Install

Note: Requires the latest Ableton Live 12 Suite Beta

1. Download the latest Audio-Merger.ablx from [Releases](https://github.com/NoahPena/Ableton-Audio-Merger/releases)
2. In Ableton, Navigate to Preferences -> Extensions
3. Drag and Drop the .ablx file
4. Restart Ableton Live

## Development

Learn about building extensions: https://ableton.github.io/extensions-sdk/

### Prerequisites

* Latest Ableton Live 12 Suite Beta
* Node.js 24.14.0 or higher
* Ableton Live Extensions SDKJ 1.0.0 or higher

## Setup

Install all of the Node.js packages

```
npm install
```

Then you'll need to create an .env file that contians the location of your Ableton Live Extension Host Module Depending on what OS you're running on:

```
# MacOS
EXTENSION_HOST_PATH=<path/to/Ableton/Live/.app>

# Windows
EXTENSION_HOST_PATH=<path/to/Ableton/Live/Extension/.node>
```

The Ableton Live SDK README as more information about this

## Scripts

```sh
npm start                  # build + run in Live's Extension Host
npm run build              # production bundle of src/extension.ts
npm run build:dev          # dev bundle (sourcemaps, not minified)
npm run package            # build for production + create a .ablx archive
```

## Help

If you run into any issues or have suggestions feel free to post it in the issues section

