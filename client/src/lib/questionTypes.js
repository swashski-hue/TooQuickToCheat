export const QUESTION_TYPES = [
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "normal", label: "Normal (alphabet)" },
  { value: "number", label: "Number" },
  { value: "sequence", label: "Sequence" },
];

export const QUESTION_TYPE_LABELS = Object.fromEntries(QUESTION_TYPES.map((t) => [t.value, t.label]));
