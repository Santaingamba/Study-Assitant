import { useCallback, useEffect, useReducer, useRef } from "react";
import { generationReducer, initialState } from "./generationReducer.js";
import { streamGenerate } from "../lib/api.js";

export function useGeneration() {
  const [state, dispatch] = useReducer(generationReducer, initialState);
  const controllerRef = useRef(null);
  const counterRef = useRef(0);

  const generate = useCallback(async (text, count = 10) => {
    controllerRef.current?.abort(); // stop the previous stream, if any
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++counterRef.current;

    dispatch({ type: "start", requestId, input: { text, count } });

    try {
      for await (const event of streamGenerate({ text, count, signal: controller.signal })) {
        if (controller.signal.aborted) return;
        dispatch({ ...event, requestId });
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error(err);
      dispatch({ type: "error", requestId, code: "client", message: "Something went wrong in the app. Please try again." });
    }
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    dispatch({ type: "cancel", requestId: ++counterRef.current });
  }, []);

  const dismissError = useCallback(() => {
    dispatch({ type: "dismiss", requestId: counterRef.current });
  }, []);

  // Leaving the page cancels the stream
  useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, generate, cancel, dismissError };
}