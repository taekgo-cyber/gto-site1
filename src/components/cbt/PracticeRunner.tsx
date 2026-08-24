"use client";

/* eslint-disable @next/next/no-img-element -- CBT image URLs can come from external sources that are not safe to proxy through the Next image optimizer. */

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  gradeCbtAnswerAction,
  toggleCbtBookmarkAction,
} from "@/lib/cbt/actions";
import type {
  CbtOption,
  GradeResult,
  PracticeMode,
  PublicCbtQuestion,
} from "@/lib/cbt/types";
import { getDisplayIndexOfOption } from "@/lib/cbt/shuffle";
import { cn } from "@/lib/utils";

type PracticeRunnerProps = {
  categoryName: string;
  categorySlug: string;
  questions: PublicCbtQuestion[];
  mode?: PracticeMode;
  isLoggedIn: boolean;
  initialBookmarkedIds?: string[];
};

type AnswerState =
  | { status: "idle" }
  | { status: "grading"; selectedOptionId: number }
  | { status: "graded"; selectedOptionId: number; result: GradeResult }
  | { status: "error"; message: string };

const IDLE_ANSWER: AnswerState = { status: "idle" };

function modeTitle(mode: PracticeMode, categoryName: string): string {
  if (mode === "wrong") return "오답 복습";
  if (mode === "bookmark") return "북마크 복습";
  return categoryName;
}

export function PracticeRunner({
  categoryName,
  categorySlug,
  questions,
  mode = "none",
  isLoggedIn,
  initialBookmarkedIds = [],
}: PracticeRunnerProps) {
  const [pool, setPool] = useState<PublicCbtQuestion[]>(questions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(
    () => new Set(initialBookmarkedIds),
  );
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const [sessionWrongOnly, setSessionWrongOnly] = useState(false);

  const total = pool.length;
  const question = pool[currentIndex];
  const finished = currentIndex >= total;
  const currentAnswer = question
    ? (answers[question.id] ?? IDLE_ANSWER)
    : IDLE_ANSWER;

  const gradedList = pool
    .filter((item) => answers[item.id]?.status === "graded")
    .map((item) => ({
      question: item,
      state: answers[item.id] as { status: "graded"; result: GradeResult },
    }));
  const correctCount = gradedList.filter((item) => item.state.result.isCorrect).length;
  const wrongCount = gradedList.length - correctCount;
  const answeredCount = gradedList.length;

  if (finished) {
    const title = sessionWrongOnly ? "오답 복습을 완료했습니다." : "문제 풀이를 완료했습니다.";
    const subTitle = sessionWrongOnly
      ? `오답 ${gradedList.length}문항 중 ${correctCount}문항을 맞혔습니다.`
      : `전체 ${total}문항 중 정답 ${correctCount}문항, 오답 ${wrongCount}문항입니다.`;

    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{modeTitle(mode, categoryName)}</h1>
        <div className="rounded-lg border border-border bg-background p-8 text-center">
          <p className="text-lg font-semibold">{title}</p>
          <p className="mt-2 text-sm text-muted-foreground">{subTitle}</p>

          {!sessionWrongOnly && wrongCount > 0 ? (
            <div className="mt-6">
              <Button size="lg" onClick={() => handleRestartWrong()}>
                틀린 문제만 다시 풀기 ({wrongCount}문항)
              </Button>
            </div>
          ) : null}

          {sessionWrongOnly ? (
            <div className="mt-6">
              <Button size="lg" variant="outline" onClick={() => handleRestartAll()}>
                전체 문제 다시 풀기
              </Button>
            </div>
          ) : null}
        </div>

        {!isLoggedIn && wrongCount > 0 ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
            <p className="text-sm font-medium">
              로그인하면 틀린 문제를 오답노트에 저장할 수 있습니다.
            </p>
            <Link href="/login" className="mt-3 block">
              <Button variant="outline" size="sm">
                로그인 / 회원가입
              </Button>
            </Link>
          </div>
        ) : null}

        <div className="flex gap-3">
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

  const handleSelectOption = async (option: CbtOption) => {
    if (currentAnswer.status !== "idle") return;

    setAnswers((prev) => ({
      ...prev,
      [question.id]: { status: "grading", selectedOptionId: option.id },
    }));

    const result = await gradeCbtAnswerAction(question.id, option.id);

    if (result.ok) {
      setAnswers((prev) => ({
        ...prev,
        [question.id]: {
          status: "graded",
          selectedOptionId: option.id,
          result: result.data,
        },
      }));
    } else {
      setAnswers((prev) => ({
        ...prev,
        [question.id]: { status: "error", message: result.message },
      }));
    }
  };

  const handlePrev = () => {
    setLoginPrompt(false);
    setCurrentIndex((index) => Math.max(0, index - 1));
  };

  const handleNext = () => {
    setLoginPrompt(false);
    setCurrentIndex((index) => index + 1);
  };

  const handleToggleBookmark = async () => {
    if (bookmarkBusy) return;

    if (!isLoggedIn) {
      setLoginPrompt(true);
      return;
    }

    setBookmarkBusy(true);
    const result = await toggleCbtBookmarkAction(question.id);
    if (result.ok) {
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (result.data.bookmarked) next.add(question.id);
        else next.delete(question.id);
        return next;
      });
    } else {
      setLoginPrompt(true);
    }
    setBookmarkBusy(false);
  };

  const handleRestartWrong = () => {
    const wrongQuestions = pool.filter(
      (item) =>
        answers[item.id]?.status === "graded" &&
        !(answers[item.id] as { status: "graded"; result: GradeResult }).result
          .isCorrect,
    );
    setSessionWrongOnly(true);
    setPool(wrongQuestions);
    setCurrentIndex(0);
  };

  const handleRestartAll = () => {
    setSessionWrongOnly(false);
    setPool(questions);
    setCurrentIndex(0);
  };

  const isBookmarked = bookmarkedIds.has(question.id);
  const grading = currentAnswer.status === "grading";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold sm:text-xl">
          {modeTitle(mode, categoryName)}
        </h1>
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {currentIndex + 1} / {total}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${total === 0 ? 0 : (answeredCount / total) * 100}%` }}
        />
      </div>

      {loginPrompt ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-medium">로그인하면 문제를 저장할 수 있습니다.</p>
          <Link href="/login" className="mt-1 inline-block text-primary underline">
            로그인 / 회원가입
          </Link>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-background p-4 sm:p-6">
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-primary">{question.subject}</p>
          <button
            type="button"
            onClick={handleToggleBookmark}
            disabled={bookmarkBusy}
            aria-pressed={isBookmarked}
            aria-label={isBookmarked ? "북마크 해제" : "북마크"}
            className={cn(
              "inline-flex min-h-11 shrink-0 touch-manipulation items-center rounded-md border border-border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              isBookmarked
                ? "border-primary bg-primary/10 text-primary"
                : "bg-background text-muted-foreground hover:bg-surface",
            )}
          >
            {isBookmarked ? "★ 북마크됨" : "☆ 북마크"}
          </button>
        </div>
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
            const isSelected =
              (currentAnswer.status === "grading" ||
                currentAnswer.status === "graded") &&
              currentAnswer.selectedOptionId === option.id;
            const isCorrect =
              currentAnswer.status === "graded" &&
              currentAnswer.result.correctOption === option.id;

            return (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => handleSelectOption(option)}
                  disabled={currentAnswer.status !== "idle"}
                  className={cn(
                    "flex min-h-[3.5rem] w-full touch-manipulation items-center gap-3 rounded-lg border border-border bg-background px-4 text-left text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed",
                    currentAnswer.status === "idle" &&
                      "hover:border-primary hover:bg-surface",
                    isSelected &&
                      currentAnswer.status === "grading" &&
                      "border-primary bg-surface",
                    isCorrect && "border-green-500 bg-green-50",
                    isSelected &&
                      !isCorrect &&
                      currentAnswer.status === "graded" &&
                      "border-red-500 bg-red-50",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="flex-1 whitespace-pre-wrap">{option.text}</span>
                  {isCorrect ? (
                    <span className="text-lg font-bold text-green-600">정답</span>
                  ) : null}
                  {isSelected &&
                  !isCorrect &&
                  currentAnswer.status === "graded" ? (
                    <span className="text-lg font-bold text-red-600">오답</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {currentAnswer.status === "grading" ? (
        <div className="rounded-lg border border-border bg-background p-6 text-center text-sm text-muted-foreground">
          채점 중...
        </div>
      ) : null}

      {currentAnswer.status === "error" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {currentAnswer.message}
        </div>
      ) : null}

      {currentAnswer.status === "graded" ? (
        <div className="rounded-lg border border-border bg-background p-4 sm:p-6">
          <p
            className={cn(
              "text-lg font-bold",
              currentAnswer.result.isCorrect ? "text-green-600" : "text-red-600",
            )}
          >
            {currentAnswer.result.isCorrect ? "정답입니다!" : "오답입니다."}
          </p>
          <div className="mt-3 space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">정답: </span>
              <span className="font-semibold">
                {getDisplayIndexOfOption(
                  question.options,
                  currentAnswer.result.correctOption,
                )}
                번
              </span>
            </p>
            {currentAnswer.result.explanation ? (
              <p className="whitespace-pre-wrap leading-relaxed">
                <span className="text-muted-foreground">해설: </span>
                {currentAnswer.result.explanation}
              </p>
            ) : null}
          </div>
          <div className="mt-4">
            <Button size="lg" className="w-full" onClick={handleNext}>
              {currentIndex === total - 1 ? "풀이 완료" : "다음 문제"}
            </Button>
          </div>
        </div>
      ) : null}

      {grading || currentAnswer.status === "idle" ? (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0 || grading}
            className="inline-flex min-h-11 touch-manipulation items-center rounded-md border border-border bg-background px-4 text-sm text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← 이전 문제
          </button>
          <p className="text-center text-xs text-muted-foreground">
            문제를 풀면 채점 결과와 해설을 확인할 수 있습니다.
          </p>
          <span className="w-[5.5rem]" aria-hidden />
        </div>
      ) : null}
    </div>
  );
}
