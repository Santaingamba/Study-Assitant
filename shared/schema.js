//schema of the flashcard format(structured ouput) (validator when methods are called on this schema)
import { z } from "zod";

const text = (max) => z.string().trim().min(1).max(500);

// Normalize typography and spacing for comparisons without changing displayed text.
export const normalizeTextForComparison = (value) =>
    value
        .normalize("NFKC")
        .toLowerCase()
        .replace(/(?<=[\p{L}\p{N}])['’](?=[\p{L}\p{N}])/gu, "")
        .replace(/\p{P}/gu, (punctuation) => punctuation === "#" ? "#" : " ")
        .replace(/\s*#/gu, "#")
        .replace(/\s*([\p{Sm}])\s*/gu, "$1")
        .replace(/\s+/gu, " ")
        .trim();

const normalize = (value) => value.trim().toLowerCase();

export const CardSchema = z.object({
    question: text(500),
    answer: text(500).min(1, "Answer is too short"),
    distractors: z.array(text(500)).length(3),
    explanation: z.string().trim().max(500).optional().default(""),
})
.superRefine((card, ctx) => {
    // Answers and distractors must stay unique despite formatting differences.
    const options = [card.answer, ...card.distractors].map(normalizeTextForComparison);

    if(new Set(options).size !== options.length){
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["distractors"],
            message: "Answer and distractors must all be different",
        });
    }

    // Keep the existing answer-containment check separate from option deduplication.
    const answer = normalize(card.answer);

    if(card.distractors.some((d) => normalize(d).includes(answer))){
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["distractors"],
            message: "Distractors should not contain the answer",
        });
    }
});

export const LIMITS = { minInput: 3, maxInput: 8000 };
