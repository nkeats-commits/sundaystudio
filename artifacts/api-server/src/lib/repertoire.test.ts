import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTitle,
  repertoirePromptBlock,
  repertoireTitleSet,
  shapeRepertoireCandidates,
  type RepertoireSong,
} from "./repertoire";

const repertoireSong = (title: string): RepertoireSong => ({
  title,
  artist: null,
  style: null,
  bpm: null,
  key: null,
  availableKeys: null,
  themes: null,
  lyricsExcerpt: null,
});

const modelSongs = (titles: string[], repertoireTitles: string[]) => {
  const titleSet = repertoireTitleSet(repertoireTitles.map(repertoireSong));
  return titles.map((title) => ({
    title,
    inRepertoire: titleSet.has(normalizeTitle(title)),
  }));
};

test("Prefer shapes a mixed model response into familiar and new songs", () => {
  const candidates = modelSongs(
    ["Amazing Grace", "Build My Life", "Great Is Thy Faithfulness", "New Song"],
    ["Amazing Grace", "Great Is Thy Faithfulness"],
  );

  const shaped = shapeRepertoireCandidates(candidates, "prefer", 4);

  assert.deepEqual(
    shaped.map((song) => song.title),
    ["Amazing Grace", "Build My Life", "Great Is Thy Faithfulness", "New Song"],
  );
  assert.deepEqual(
    shaped.map((song) => song.inRepertoire),
    [true, false, true, false],
  );
});

test("Prefer preserves useful results when only one candidate group exists", () => {
  const candidates = modelSongs(
    ["Amazing Grace", "Great Is Thy Faithfulness"],
    ["Amazing Grace", "Great Is Thy Faithfulness"],
  );

  assert.deepEqual(
    shapeRepertoireCandidates(candidates, "prefer", 4).map(
      (song) => song.title,
    ),
    ["Amazing Grace", "Great Is Thy Faithfulness"],
  );
});

test("Off removes case-insensitive, whitespace-normalized repertoire matches", () => {
  const candidates = modelSongs(
    ["  amazing grace  ", "Build My Life", "GREAT IS THY FAITHFULNESS"],
    ["Amazing Grace", "Great Is Thy Faithfulness"],
  );

  const shaped = shapeRepertoireCandidates(candidates, "off", 4);

  assert.deepEqual(shaped.map((song) => song.title), ["Build My Life"]);
  assert.ok(shaped.every((song) => !song.inRepertoire));
});

test("Strict keeps only repertoire candidates and does not invent replacements", () => {
  const candidates = modelSongs(
    ["Amazing Grace", "Build My Life", "Great Is Thy Faithfulness"],
    ["Amazing Grace", "Great Is Thy Faithfulness"],
  );

  assert.deepEqual(
    shapeRepertoireCandidates(candidates, "strict", 6).map(
      (song) => song.title,
    ),
    ["Amazing Grace", "Great Is Thy Faithfulness"],
  );
});

test("empty repertoire keeps Prefer and Off useful while Strict stays empty", () => {
  const candidates = modelSongs(
    ["Build My Life", "Yet Not I But Through Christ in Me"],
    [],
  );

  assert.equal(shapeRepertoireCandidates(candidates, "prefer", 4).length, 2);
  assert.equal(shapeRepertoireCandidates(candidates, "off", 4).length, 2);
  assert.equal(shapeRepertoireCandidates(candidates, "strict", 4).length, 0);
});

test("Off prompt supplies an explicit exact-title exclusion list", () => {
  const prompt = repertoirePromptBlock(
    [repertoireSong("Amazing Grace"), repertoireSong("Great Is Thy Faithfulness")],
    "off",
  );

  assert.match(prompt, /REPERTOIRE EXCLUSION LIST/);
  assert.match(prompt, /Amazing Grace/);
  assert.match(prompt, /ignoring case and surrounding whitespace/);
});
