export type AnswersMap = Record<string, number | string>;

export function buildGradePayload(quiz: any, answersMap: AnswersMap) {
  const qArr = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const isShort = String(quiz?.quizType || qArr[0]?.type || 'mcq').toLowerCase() === 'short';

  const cleanQuiz = {
    quizType: isShort ? 'short' : 'mcq',
    questions: qArr.map((q: any) =>
      isShort
        ? {
            id: q.id,
            type: 'short',
            prompt: q.prompt ?? q.display ?? '',
            display: q.display ?? q.prompt ?? '',
            answer: q.answer,
            accept: q.accept ?? [],
            regex: q.regex ?? undefined,
          }
        : {
            id: q.id,
            type: 'mcq',
            prompt: q.prompt ?? q.display ?? '',
            display: q.display ?? q.prompt ?? '',
            choices: q.choices ?? [],
            answerIndex: Number(q.answerIndex ?? q.correctIndex ?? 0),
          }
    ),
  };

  const answers = qArr.map((q: any) => {
    if (isShort || q.type === 'short') {
      return {
        questionId: q.id,
        answerText: String(answersMap[q.id] ?? '').trim(), // text only for short
      };
    }
    const idx = Number(answersMap[q.id]);
    return {
      questionId: q.id,
      choiceIndex: Number.isFinite(idx) ? idx : 0,
    };
  });

  return { quiz: cleanQuiz, answers };
}
export default buildGradePayload;
