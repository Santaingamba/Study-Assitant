import { CardSchema } from "./schema.js";

const good = {
    question: "What is the capital of France ?",
    answer: "Paris",
    distractors: ["Lyon", "Marseille", "Nice"],
    explanation: "Paris is the capital and the largest city of France.",
};

const cases = {     //cases is an object of objects
    "1) good card": good,
    "2) only two distractors": {...good, distractors: ["Lyon", "Nice"]},
    "3) repeated answers": {...good, distractors: ["Paris", "Lyon", "Nice"]},
    "4) empty question": {...good, question: "   "},
    "5) extra field + padded spaces": {...good, question: "     What is the capital of France   ?", difficulty: "hard"}, //will pass because extra filed is stripped by zod
    "6) missing explanation": {...good, explanation: "    "},   
};

for(const [name, card] of Object.entries(cases)){   //destructuring "cases", Object.entries(cases) converts objects inside cases into key value pair
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
// safeParse() checks whether the data matches the schema.
// It never crashes or throws an error.
// Instead, it returns an object telling us:
// success: true  -> data is valid and available in result.data
// success: false -> data is invalid and errors are available in result.error