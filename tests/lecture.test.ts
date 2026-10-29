import assert from "node:assert/strict";
import { test } from "node:test";

import { composeLecture, selectFigures, parseSlide } from "@/deck/compose";
import type { DeckSlide } from "@/deck/compose";

function slide(number: number, title: string, extra: Partial<DeckSlide> = {}): DeckSlide {
  return {
    number,
    footer: extra.footer ?? `${number} / 80`,
    drawings: extra.drawings ?? 0,
    imageFile: extra.imageFile,
    lines: extra.lines ?? ["GRADIENT DESCENT · AMA 564", title, "A readable sentence about the update rule."],
  };
}

test("a contents slide is not a figure, and a chart slide is", () => {
  const slides = [
    slide(1, "目录 agenda", { lines: ["FOUNDATIONS · AMA 564", "目录 agenda", "How do we train?"], drawings: 20 }),
    slide(2, "The right direction can still overshoot", { drawings: 12, images: 1, imageFile: "/tmp/p2.jpg" }),
    slide(3, "Smoothness and a safe step", { drawings: 1 }),
    slide(8, "References for this lecture", {
      lines: ["REFERENCES · AMA 564", "References for this lecture", "Bottou Curtis and Nocedal"],
      drawings: 15,
    }),
  ].map(parseSlide);
  const picked = selectFigures(slides);
  assert.equal(picked.has(1), false);
  assert.equal(picked.has(2), true);
  assert.equal(picked.has(8), false);
});

test("the composed lecture keeps readable sentences and the selected figure", () => {
  const slides: DeckSlide[] = [
    {
      number: 1,
      footer: "01 / 80",
      drawings: 0,
      lines: ["AMA 564 · DEEP LEARNING · LECTURE 2", "Gradient descent", "From exact gradients to noisy updates."],
    },
    {
      number: 16,
      footer: "16 / 80",
      drawings: 12,
      imageFile: "/tmp/p16.jpg",
      lines: [
        "GRADIENT DESCENT · AMA 564",
        "The right direction can still overshoot",
        "Smooth approach when the step is small.",
        "0 < a < 1",
        "Original teaching illustration · synthetic data where shown",
        "16 / 80",
      ],
    },
  ];
  const lecture = composeLecture(slides);
  assert.match(lecture.title, /课件生成/);
  assert.equal(lecture.blocks.some((block) => block.kind === "image" && block.file === "/tmp/p16.jpg"), true);
  assert.equal(
    lecture.blocks.some((block) => block.kind === "bulleted_list_item" && block.text.includes("Smooth approach")),
    true,
  );
  assert.equal(
    lecture.blocks.some((block) => block.kind === "bulleted_list_item" && block.text.includes("0 < a")),
    false,
  );
});
