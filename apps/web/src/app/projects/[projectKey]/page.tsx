import { ProjectWorkspace } from "../project-workspace";

type Props = {
  params: Promise<{ projectKey: string }>;
};

export default async function ProjectTasksPage({ params }: Props) {
  const { projectKey } = await params;
  const decodedKey = decodeURIComponent(projectKey);

  return <ProjectWorkspace projectKey={decodedKey} />;
}
