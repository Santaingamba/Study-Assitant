//schema of the flashcard format(structured ouput) (validator when methods are called on this schema)
import { z } from "zod";

const text = (max) => z.string().trim().min(1).max(500);

const normalize = (s) => s.trim().toLowerCase();

export const CardSchema = z.object({
    question: text(500),
    answer: text(500).min(2, "Answer is too short"),
    distractors: z.array(text(500)).length(3),
    explaination: z.string().trim().max(500).optional().default(""),
})
.superRefine((card, ctx) => {
    //question must end with '?'
    if(!card.question.endsWith("?")){
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["question"],
            message: "Question should end with '?'",
        });
    }

    //answers and distractors must all be unique
    const options = [card.answer, ...card.distractors].map(normalize);

    if(new Set(options).size !== options.length){
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["distractors"],
            message: "Answer and distractors must all be different",
        });
    }

    //distractors shouldn't contain the answer
    const answer = normalize(card.answer);

    if(card.distractors.some((d) => normalize(d).includes(answer))){
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["distractors"],
            message: "Distractors should not contain the answer",
        });
    }
});
