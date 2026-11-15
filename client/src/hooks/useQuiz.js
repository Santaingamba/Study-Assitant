import { useReducer } from "react";
import { quizReducer, initialQuiz, buildQuiz, buildRetest } from "../lib/quiz.js";

export function useQuiz(cards) {
  const [state, dispatch] = useReducer(quizReducer, initialQuiz);

  // Randomness happens here, before dispatch, so the reducer stays pure
  const start = () => dispatch({ type: "start", questions: buildQuiz(cards) });
  const retestMissed = () => dispatch({ type: "retest", questions: buildRetest(state.missed) });
  const answer = (choice) => dispatch({ type: "answer", choice });
  const next = () => dispatch({ type: "next" });

  return { state, start, answer, next, retestMissed };
}