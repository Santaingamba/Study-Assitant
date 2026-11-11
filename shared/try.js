import { CardSchema } from "./schema.js";

const good = {
    question: "What is the capital of France ?",
    answer: "Paris",
    distractors: ["Lyon", "Marseille", "Nice"],
    explaination: "Paris is the capital and the largest city of France.",
};

const cases = {
    "1) good card": good,
    "2) only two distractors": {...good, distractors: ["Lyon", "Nice"]},
    "3) repeated answers": {...good, distractors: ["Paris", "Lyon", "Nice"]},
    "4) empty question": {...good, question: "   "},
    "5) extra field + padded spaces": {...good, question: "     What is the capital of France   ?", difficulty: "hard"},
    "6) missing explaination": {...good, explaination: "    "},
    "7) question doesn't end with '?' ": {...good, question: "What is the capital of France"},
};

for(const [name, card] of Object.entries(cases)){
    const result = CardSchema.safeParse(card);
    console.log("\n" + name);
    if(result.success) {
        console.log("PASS -> ", JSON.stringify(result.data));
    }else{
        for(const issue of result.error.issues){
            console.log("FAIL -> ", issue.path.join(".") || "(Whole card)", ":", issue.message);
        }
    }
}