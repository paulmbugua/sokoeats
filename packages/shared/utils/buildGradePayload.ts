export type AnswersMap = Record<string, number | string>;

type BuildGradeExtras = {
  courseId?: string;
  passMark?: number;
  assignmentId?: string;
};

export function buildGradePayload(quiz: any, answersMap: AnswersMap, extras?: BuildGradeExtras) {
  const qArr = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const isShort = String(quiz?.quizType || qArr[0]?.type || 'mcq').toLowerCase() === 'short';

  // ✅ Resolve courseId from extras first, then quiz (if present)
  const courseIdRaw = extras?.courseId ?? quiz?.courseId ?? quiz?.course_id ?? quiz?.id;
  const courseId = typeof courseIdRaw === 'string' && courseIdRaw.trim() ? courseIdRaw.trim() : undefined;

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
        answerText: String(answersMap[q.id] ?? '').trim(),
      };
    }
    const idx = Number(answersMap[q.id]);
    return {
      questionId: q.id,
      choiceIndex: Number.isFinite(idx) ? idx : 0,
    };
  });

  // ✅ Include courseId + optional extras in the final payload
  return {
    ...(courseId ? { courseId } : {}),
    ...(typeof extras?.passMark === 'number' ? { passMark: extras.passMark } : {}),
    ...(extras?.assignmentId ? { assignmentId: extras.assignmentId } : {}),
    quiz: cleanQuiz,
    answers,
  };
}

export default buildGradePayload;
