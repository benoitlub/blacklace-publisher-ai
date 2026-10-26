import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { command, probe, decode, fontPath, StudioError } from "./runtime";
import { measureAudio } from "./audio";
import type { StudioRequest } from "./request";
const stamp = (n: number, ass = false) => {
  const ms = Math.round(n * (ass ? 100 : 1000)),
    unit = ass ? 100 : 1000;
  return `${String(Math.floor(ms / (3600 * unit))).padStart(ass ? 1 : 2, "0")}:${String(Math.floor(ms / (60 * unit)) % 60).padStart(2, "0")}:${String(Math.floor(ms / unit) % 60).padStart(2, "0")}${ass ? "." : ","}${String(ms % unit).padStart(ass ? 2 : 3, "0")}`;
};
export function captionLines(text: string) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (word.length > 28) throw new StudioError("CAPTION_WORD_TOO_LONG");
    if (line && (line + " " + word).length > 28) {
      lines.push(line);
      line = word;
    } else line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  if (lines.length > 3) throw new StudioError("CAPTION_TOO_LONG");
  return lines;
}
export async function produceVideo(
  request: StudioRequest,
  dir: string,
  audio: { segments: { caption: string; start: number; end: number }[] },
) {
  const captions = audio.segments.map((s, i) => ({
    ...s,
    end:
      i === audio.segments.length - 1
        ? Math.max(s.end, request.durationSeconds - 0.3)
        : s.end,
    lines: captionLines(s.caption),
  }));
  const ass =
    `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,58,&H00FFFFFF,&H00FFFFFF,&H00090812,&H80090812,-1,0,0,0,100,100,0,0,3,3,1,2,70,70,290,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
    captions
      .map(
        (s) =>
          `Dialogue: 0,${stamp(s.start, true)},${stamp(s.end, true)},Default,,0,0,0,,${s.lines.join("\\N")}`,
      )
      .join("\n") +
    "\n";
  await writeFile(path.join(dir, "captions.ass"), ass);
  await writeFile(
    path.join(dir, "captions.srt"),
    captions
      .map(
        (s, i) =>
          `${i + 1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.lines.join("\n")}\n`,
      )
      .join("\n"),
  );
  await writeFile(path.join(dir, "title.txt"), request.title);
  const font = await fontPath();
  const filter = `zoompan=z='min(zoom+0.00007,1.045)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30,drawbox=x=0:y=130:w=iw:h=170:color=0x0c0814@0.92:t=fill,drawtext=fontfile='${font}':textfile=title.txt:expansion=none:fontcolor=white:fontsize=64:x=(w-text_w)/2:y=180,subtitles=captions.ass,format=yuv420p,setsar=1`;
  await command(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-y",
      "-loop",
      "1",
      "-framerate",
      "30",
      "-i",
      "image.png",
      "-i",
      "audio.wav",
      "-filter_threads",
      "1",
      "-vf",
      filter,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-t",
      String(request.durationSeconds),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "30",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      "short.mp4",
    ],
    dir,
  );
  const file = path.join(dir, "short.mp4"),
    p = await probe(file),
    v = p.streams.find((s) => s.codec_type === "video"),
    a = p.streams.find((s) => s.codec_type === "audio");
  const duration = Number(p.format.duration);
  if (
    !v ||
    !a ||
    v.width !== 1080 ||
    v.height !== 1920 ||
    v.codec_name !== "h264" ||
    a.codec_name !== "aac" ||
    v.pix_fmt !== "yuv420p" ||
    v.r_frame_rate !== "30/1" ||
    Math.abs(duration - request.durationSeconds) > 0.1 ||
    Number(a.sample_rate) !== 48000 ||
    a.channels !== 2
  )
    throw new StudioError("MP4_FORMAT_VERIFICATION_FAILED");
  await decode(file);
  const loudness = await measureAudio(file);
  if (
    Math.abs(loudness.integratedLufs + 16) > 1 ||
    loudness.truePeakDbtp > -0.5
  )
    throw new StudioError("MP4_AUDIO_VERIFICATION_FAILED");
  await command(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-y",
      "-ss",
      String(Math.min(2, duration / 4)),
      "-i",
      "short.mp4",
      "-frames:v",
      "1",
      "-threads",
      "2",
      "poster.jpg",
    ],
    dir,
  );
  const frames = await command(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-i",
      "short.mp4",
      "-an",
      "-vf",
      "fps=1/4,scale=90:160",
      "-f",
      "framemd5",
      "-",
    ],
    dir,
  );
  const frameHashes = frames.stdout
    .split("\n")
    .filter((s) => s && !s.startsWith("#"))
    .map((s) => s.split(",").at(-1)?.trim());
  if (new Set(frameHashes).size < 2)
    throw new StudioError("VIDEO_ANIMATION_UNVERIFIED");
  return {
    verified: true,
    fullDecode: true,
    width: v.width,
    height: v.height,
    fps: 30,
    durationSeconds: duration,
    videoCodec: v.codec_name,
    pixelFormat: v.pix_fmt,
    audioCodec: a.codec_name,
    sampleRate: 48000,
    channels: a.channels,
    loudness,
    synchronizedCaptionCount: captions.length,
    subtitleTiming:
      "per-sentence measured TTS durations; no word-level alignment",
    animation: "slow image zoom; no inferred character or gameplay animation",
    distinctSampledFrames: new Set(frameHashes).size,
  };
}
