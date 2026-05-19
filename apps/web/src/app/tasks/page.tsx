import { redirect } from "next/navigation";

/** Legacy route — task board lives under /projects/[projectKey]. */
export default function TasksPage() {
  redirect("/projects");
}
