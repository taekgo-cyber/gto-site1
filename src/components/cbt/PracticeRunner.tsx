"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { gradeCbtAnswerAction } from "@/lib/cbt/actions";
import type { CbtOption, GradeResult, PublicCbtQuestion } from "@/lib/cbt/types";
import { cn } from "@/lib/utils";

type PracticeRunnerProps = {
  categoryName: string;
  categorySlug: string;
  questions: PublicCbtQuestion[];
};

type AnswerState =
  | { status: "idle" }
  | { status: "grading"; selectedOptionId: number }
  | { status: "graded"; selectedOptionId: number; result: GradeResult }
  | { status: "error"; message: string };

export function PracticeRunner({
  categoryName,
  categorySlug,
  questions,
}: PracticeRunnerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState<AnswerState>({ status: "idle" });

  const total = questions.length;
  const question = questions[currentIndex];
  const isLast = currentIndex === total - 1;
  const finished = currentIndex >= total;

  if (finished) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{categoryName}</h1>
        <div className="rounded-lg border border-border bg-background p-8 text-center">
          <p className="text-lg font-semibold">문제 풀이를 완료했습니다.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            전체 {total}문항의 풀이를 마쳤습니다.
          </p>
        </div>
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
    if (answer.status !== "idle") return;

    setAnswer({ status: "grading", selectedOptionId: option.id });
    const result = await gradeCbtAnswerAction(question.id, option.id);

    if (result.ok) {
      setAnswer({
        status: "graded",
        selectedOptionId: option.id,
        result: result.data,
      });
    } else {
      setAnswer({ status: "error", message: result.message });
    }
  };

  const handleNext = () => {
    setAnswer({ status: "idle" });
    setCurrentIndex((index) => index + 1);
  };

  const grading = answer.status === "grading";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold sm:text-xl">{categoryName}</h1>
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {currentIndex + 1} / {total}
        </span>
      </div>

      <div className="rounded-lg border border-border bg-background p-4 sm:p-6">
        <p className="mb-1 text-sm font-medium text-primary">{question.subject}</p>
        <h2 className="whitespace-pre-wrap text-lg leading-relaxed sm:text-xl">
          {question.questionText}
        </h2>
        {question.imageUrl ? (
          <img
            src={question.imageUrl}
            alt="문제 이미지"
            className="mt-4 w-full rounded-md border border-border"
          />
        ) : null}

        <ul className="mt-6 space-y-3">
          {question.options.map((option) => {
            const isSelected =
              (answer.status === "grading" || answer.status === "graded") &&
              answer.selectedOptionId === option.id;
            const isCorrect =
              answer.status === "graded" &&
              answer.result.correctOption === option.id;

            return (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => handleSelectOption(option)}
                  disabled={answer.status !== "idle"}
                  className={cn(
                    "flex min-h-[3.5rem] w-full items-center gap-3 rounded-lg border border-border bg-background px-4 text-left text-base transition-colors disabled:cursor-not-allowed",
                    answer.status === "idle" &&
                      "hover:border-primary hover:bg-surface",
                    isSelected && answer.status === "grading" &&
                      "border-primary bg-surface",
                    isCorrect && "border-green-500 bg-green-50",
                    isSelected &&
                      !isCorrect &&
                      answer.status === "graded" &&
                      "border-red-500 bg-red-50",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-semibold text-muted-foreground">
                    {option.id}
                  </span>
                  <span className="flex-1 whitespace-pre-wrap">{option.text}</span>
                  {isCorrect ? (
                    <span className="text-lg font-bold text-green-600">정답</span>
                  ) : null}
                  {isSelected &&
                  !isCorrect &&
                  answer.status === "graded" ? (
                    <span className="text-lg font-bold text-red-600">오답</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {answer.status === "grading" ? (
        <div className="rounded-lg border border-border bg-background p-6 text-center text-sm text-muted-foreground">
          채점 중...
        </div>
      ) : null}

      {answer.status === "error" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {answer.message}
        </div>
      ) : null}

      {answer.status === "graded" ? (
        <div className="rounded-lg border border-border bg-background p-4 sm:p-6">
          <p
            className={cn(
              "text-lg font-bold",
              answer.result.isCorrect ? "text-green-600" : "text-red-600",
            )}
          >
            {answer.result.isCorrect ? "정답입니다!" : "오답입니다."}
          </p>
          <div className="mt-3 space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">정답: </span>
              <span className="font-semibold">{answer.result.correctOption}번</span>
            </p>
            {answer.result.explanation ? (
              <p className="whitespace-pre-wrap leading-relaxed">
                <span className="text-muted-foreground">해설: </span>
                {answer.result.explanation}
              </p>
            ) : null}
          </div>
          <div className="mt-4">
            <Button size="lg" className="w-full" onClick={handleNext}>
              {isLast ? "풀이 완료" : "다음 문제"}
            </Button>
          </div>
        </div>
      ) : null}

      {grading || answer.status === "idle" ? (
        <p className="text-center text-xs text-muted-foreground">
          문제를 풀면 채점 결과와 해설을 확인할 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}
