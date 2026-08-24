"use client";

/* eslint-disable @next/next/no-img-element -- CBT image URLs can come from external sources that are not safe to proxy through the Next image optimizer. */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { submitCbtExamAction } from "@/lib/cbt/actions";
import type { ExamGradeResult } from "@/lib/cbt/exam";
import type { PublicCbtQuestion } from "@/lib/cbt/types";
import { getDisplayIndexOfOption } from "@/lib/cbt/shuffle";
import { cn } from "@/lib/utils";

type ExamRunnerProps = {
  categoryName: string;
  categorySlug: string;
  questions: PublicCbtQuestion[];
  isLoggedIn: boolean;
  timeLimitMinutes: number;
};

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ExamRunner({
  categoryName,
  categorySlug,
  questions,
  isLoggedIn,
  timeLimitMinutes,
}: ExamRunnerProps) {
  const total = questions.length;
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(timeLimitMinutes * 60);
  const [result, setResult] = useState<ExamGradeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showNavGrid, setShowNavGrid] = useState(false);

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const submittingRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    startTimeRef.current = Date.now();
  }, []);

  const handleSubmit = useCallback(
    async (withConfirm: boolean) => {
      if (submittingRef.current || result) return;

      const answered = Object.keys(answersRef.current).length;
      if (withConfirm && answered < total) {
        setConfirmOpen(true);
        return;
      }

      setConfirmOpen(false);
      submittingRef.current = true;
      setSubmitting(true);
      setError(null);

      const duration = Math.max(
        0,
        Math.round((Date.now() - (startTimeRef.current ?? 0)) / 1000),
      );
      const response = await submitCbtExamAction(
        categorySlug,
        answersRef.current,
        duration,
      );

      submittingRef.current = false;
      setSubmitting(false);
      if (response.ok) {
        setResult(response.data);
      } else {
        setError(response.message);
      }
    },
    [categorySlug, result, total],
  );

  useEffect(() => {
    if (result) return;
    if (remainingSeconds <= 0) {
      void handleSubmit(false);
      return;
    }
    const timer = setInterval(() => {
      setRemainingSeconds((seconds) => (seconds > 0 ? seconds - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSeconds, result, handleSubmit]);

  useEffect(() => {
    if (result) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [result]);

  const question = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;

  const selectOption = (optionId: number) => {
    if (result || submitting) return;
    setAnswers((prev) => {
      const next = { ...prev };
      if (next[question.id] === optionId) delete next[question.id];
      else next[question.id] = optionId;
      return next;
    });
  };

  if (result) {
    const wrongResults = result.results.filter((item) => !item.isCorrect);
    const questionById = new Map(questions.map((q) => [q.id, q]));

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold sm:text-xl">
            {categoryName} 모의고사 결과
          </h1>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-sm font-bold",
              result.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
            )}
          >
            {result.passed ? "합격" : "불합격"}
          </span>
        </div>

        <div className="rounded-lg border border-border bg-background p-6 text-center">
          <p className="text-4xl font-bold">{result.score}점</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {result.totalQuestions}문항 중 정답 {result.correctCount}문항 · 오답{" "}
            {result.wrongCount}문항 · 미응답 {result.unansweredCount}문항
          </p>
        </div>

        {result.subjectResults.length > 0 ? (
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="mb-2 text-sm font-semibold">과목별 결과</p>
            <ul className="divide-y divide-border">
              {result.subjectResults.map((subject) => (
                <li
                  key={subject.subject}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <span className="font-medium">{subject.subject}</span>
                  <span className="text-muted-foreground">
                    {subject.correct}/{subject.total} · {subject.score}점
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!isLoggedIn ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
            <p className="text-sm font-medium">
              수고하셨습니다! 로그인하면 틀린 문제({wrongResults.length}개)를
              오답노트에 저장할 수 있습니다.
            </p>
            <Link href="/login" className="mt-3 block">
              <Button variant="outline" size="sm">
                로그인 / 회원가입
              </Button>
            </Link>
          </div>
        ) : null}

        {wrongResults.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">오답 복습</h2>
            {wrongResults.map((wrong) => {
              const item = questionById.get(wrong.questionId);
              if (!item) return null;
              return (
                <div
                  key={wrong.questionId}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <p className="mb-1 text-sm font-medium text-primary">
                    {wrong.subject}
                  </p>
                  <p className="whitespace-pre-wrap font-medium">
                    {item.questionText}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {item.options.map((option) => {
                      const isCorrectOption = option.id === wrong.correctOption;
                      const isSelected = option.id === wrong.selectedOptionId;
                      return (
                        <li
                          key={option.id}
                          className={cn(
                            "flex min-h-[3rem] items-center gap-3 rounded-lg border px-4 text-sm",
                            isCorrectOption && "border-green-500 bg-green-50",
                            isSelected && !isCorrectOption && "border-red-500 bg-red-50",
                            !isCorrectOption && !isSelected && "border-border bg-background",
                          )}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-muted-foreground">
                            {getDisplayIndexOfOption(item.options, option.id)}
                          </span>
                          <span className="flex-1 whitespace-pre-wrap">
                            {option.text}
                          </span>
                          {isCorrectOption ? (
                            <span className="shrink-0 text-xs font-bold text-green-600">
                              정답
                            </span>
                          ) : null}
                          {isSelected && !isCorrectOption ? (
                            <span className="shrink-0 text-xs font-bold text-red-600">
                              선택
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  {wrong.explanation ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                      <span className="text-muted-foreground">해설: </span>
                      {wrong.explanation}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          {isLoggedIn ? (
            <Link href={`/cbt/${categorySlug}/practice?mode=wrong`} className="flex-1">
              <Button variant="outline" size="lg" className="w-full">
                내 오답 복습하기
              </Button>
            </Link>
          ) : null}
          <Link href={`/cbt/${categorySlug}`} className="flex-1">
            <Button variant="outline" size="lg" className="w-full">
              시험 소개로 돌아가기
            </Button>
          </Link>
          <Link href="/cbt" className="flex-1">
            <Button size="lg" className="w-full">
              다른 시험 풀기
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const lowTime = remainingSeconds < 300;

  return (
    <div className="space-y-4 pb-24 sm:pb-0">
      <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-base font-bold sm:text-lg">{categoryName} 모의고사</h1>
          <span
            className={cn(
              "whitespace-nowrap rounded-md px-2.5 py-1 text-sm font-bold tabular-nums",
              lowTime ? "bg-red-100 text-red-700" : "bg-surface text-foreground",
            )}
          >
            ⏱ {formatTime(remainingSeconds)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            답변 {answeredCount} / {total}
          </span>
          <button
            type="button"
            onClick={() => setShowNavGrid((value) => !value)}
            className="inline-flex min-h-11 touch-manipulation items-center rounded-md border border-border px-3 text-xs text-foreground hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {showNavGrid ? "문제 목록 닫기" : "문제 목록"}
          </button>
        </div>
      </div>

      {showNavGrid ? (
        <div className="grid max-h-48 grid-cols-8 gap-1.5 overflow-y-auto rounded-lg border border-border bg-background p-3 sm:grid-cols-12">
          {questions.map((item, index) => {
            const answered = answers[item.id] !== undefined;
            const current = index === currentIndex;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className={cn(
                  "flex min-h-11 touch-manipulation items-center justify-center rounded-md border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  answered ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground",
                  current && "ring-2 ring-ring",
                )}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-background p-4 sm:p-6">
        <p className="mb-1 text-sm font-medium text-primary">
          {question.subject} · {currentIndex + 1}번
        </p>
        <h2 className="whitespace-pre-wrap text-lg leading-relaxed sm:text-xl">
          {question.questionText}
        </h2>
        {question.imageUrl ? (
          <img
            src={question.imageUrl}
            alt="문제 이미지"
            loading="lazy"
            decoding="async"
            className="mt-4 w-full rounded-md border border-border"
          />
        ) : null}

        <ul className="mt-6 space-y-3">
          {question.options.map((option, index) => {
            const isSelected = answers[question.id] === option.id;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => selectOption(option.id)}
                  className={cn(
                    "flex min-h-[3.5rem] w-full touch-manipulation items-center gap-3 rounded-lg border px-4 text-left text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:border-primary hover:bg-surface",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="flex-1 whitespace-pre-wrap">{option.text}</span>
                  {isSelected ? (
                    <span className="text-lg font-bold text-primary">✓</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            disabled={currentIndex === 0 || submitting}
          >
            ← 이전
          </Button>
          {currentIndex < total - 1 ? (
            <Button
              size="lg"
              className="flex-1"
              onClick={() => setCurrentIndex((index) => index + 1)}
              disabled={submitting}
            >
              다음 →
            </Button>
          ) : (
            <Button
              size="lg"
              className="flex-1"
              onClick={() => void handleSubmit(true)}
              disabled={submitting}
            >
              {submitting ? "제출 중..." : "시험 제출"}
            </Button>
          )}
        </div>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 text-center">
            <p className="text-base font-semibold">
              미응답 문제가 있습니다.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {total - answeredCount}문항을 풀지 않았습니다. 제출할까요?
            </p>
            <div className="mt-5 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmOpen(false)}
              >
                계속 풀기
              </Button>
              <Button
                className="flex-1"
                onClick={() => void handleSubmit(false)}
              >
                제출
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
