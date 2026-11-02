"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { newProjectCode, projectLabel } from "@/lib/projects";
import { requestOrigin } from "@/lib/requestOrigin";

export type CreateProjectState = {
  error?: string;
  field?: "number" | "name";
  /** What was typed, so the form keeps it when there is an error. */
  values?: { number: string; name: string };
  created?: { label: string; url: string };
};

export async function createProject(_prev: CreateProjectState, formData: FormData): Promise<CreateProjectState> {
  const email = await requireAdmin();
  const number = String(formData.get("number") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const values = { number, name };
  if (!name) return { error: "Prosjektnavn er påkrevd", field: "name", values };
  if (number.length > 20) return { error: "Prosjektnummeret er for langt", field: "number", values };
  if (name.length > 120) return { error: "Prosjektnavnet er for langt", field: "name", values };

  // A clash between two random codes is very unlikely; try again a couple of times if it happens.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const project = await prisma.project.create({
        data: { code: newProjectCode(), number: number || null, name, createdBy: email },
        select: { code: true, number: true, name: true },
      });
      revalidatePath("/admin");
      return { created: { label: projectLabel(project), url: `${await requestOrigin()}/p/${project.code}` } };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  return { error: "Kunne ikke opprette prosjektet. Prøv igjen.", values };
}

export async function setProjectClosed(projectId: string, closed: boolean) {
  await requireAdmin();
  await prisma.project.update({
    where: { id: projectId },
    data: { closedAt: closed ? new Date() : null },
  });
  revalidatePath("/admin");
}
