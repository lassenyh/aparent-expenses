import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SubmissionStatus } from "@prisma/client";

const ACCOUNT_NUMBER_LENGTH = 11;

function sanitizeAccountNumber(value: string | undefined | null): string | null {
  if (value == null || value === "") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length === ACCOUNT_NUMBER_LENGTH ? digits : null;
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      name?: string | null;
      projectNumber?: string | null;
      project?: string | null;
      workDate?: string | null;
      productionCash?: number | null;
      accountNumber?: string | null;
    };

    const { token, ...fields } = body;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const submission = await prisma.submission.findUnique({
      where: { accessToken: token },
      select: { id: true, status: true },
    });

    if (!submission || submission.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Submission not found or not editable" },
        { status: 404 }
      );
    }

    const accountNumber = sanitizeAccountNumber(fields.accountNumber);
    if (fields.accountNumber != null && fields.accountNumber !== "" && !accountNumber) {
      return NextResponse.json(
        { error: "Kontonummer må være 11 sifre" },
        { status: 400 }
      );
    }

    const data: {
      name?: string | null;
      projectNumber?: string | null;
      project?: string | null;
      workDate?: Date | null;
      productionCash?: number | null;
      accountNumber?: string | null;
    } = {};

    if (fields.name !== undefined) data.name = fields.name ?? null;
    if (fields.projectNumber !== undefined) data.projectNumber = fields.projectNumber ?? null;
    if (fields.project !== undefined) data.project = fields.project ?? null;
    if (fields.workDate !== undefined) {
      data.workDate = fields.workDate ? new Date(fields.workDate) : null;
    }
    if (fields.productionCash !== undefined) data.productionCash = fields.productionCash ?? null;
    if (fields.accountNumber !== undefined) data.accountNumber = accountNumber;

    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data,
      include: { receipts: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      action?: string;
    };

    const token = body?.token;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const submission = await prisma.submission.findUnique({
      where: { accessToken: token },
      include: { receipts: true },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (submission.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Allerede sendt inn" },
        { status: 400 }
      );
    }

    const accountNumber = sanitizeAccountNumber(submission.accountNumber);
    const hasValidAccount = accountNumber !== null && accountNumber.length === ACCOUNT_NUMBER_LENGTH;

    if (!submission.name?.trim()) {
      return NextResponse.json(
        { error: "Navn er påkrevd" },
        { status: 400 }
      );
    }
    if (!submission.project?.trim()) {
      return NextResponse.json(
        { error: "Prosjekt er påkrevd" },
        { status: 400 }
      );
    }
    if (!submission.workDate) {
      return NextResponse.json(
        { error: "Dato er påkrevd" },
        { status: 400 }
      );
    }
    if (!hasValidAccount) {
      return NextResponse.json(
        { error: "Kontonummer må være 11 sifre" },
        { status: 400 }
      );
    }
    if (!submission.receipts.length) {
      return NextResponse.json(
        { error: "Minst én kvittering er påkrevd" },
        { status: 400 }
      );
    }

    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: { status: SubmissionStatus.SUBMITTED },
      include: { receipts: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
