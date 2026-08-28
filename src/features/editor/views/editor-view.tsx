import { useFile, useUpdateFile } from "@/features/projects/hooks/use-files";
import { Id } from "../../../../convex/_generated/dataModel";
import { FileBreadcrumbs } from "../components/file-breadcrumbs";
import { TopNavigation } from "../components/top-navigation";
import { useEditor } from "../hooks/use-editor";
import Image from "next/image";
import { CodeEditor } from "../components/code-editor";
import { useEffect, useRef } from "react";

const DEBOUNCE_MS = 1500;

interface EditorViewProps {
  projectId: Id<"projects">;
}

export const EditorView = ({ projectId }: EditorViewProps) => {
  const { activeTabId } = useEditor(projectId);
  const activeFile = useFile(activeTabId);
  const updateFile = useUpdateFile();
  //Time debouncing reference for updating the file on save
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isActiveFileBinary = activeFile && activeFile.storageId;
  const isActiveFileText = activeFile && !activeFile.storageId;

  //unmount the api save request timeout when we change the tab
  useEffect(() => {
    () => timeoutRef.current && clearTimeout(timeoutRef.current);
  }, [activeTabId]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center">
        <TopNavigation projectId={projectId} />
      </div>
      {activeTabId && <FileBreadcrumbs projectId={projectId} />}
      <div className="flex-1 min-h-0 bg-background">
        {!activeFile && (
          <div className="h-full flex items-center gap-2 justify-center">
            <Image
              src={"/logo-alt.svg"}
              alt="Anubithic/Studio"
              width={80}
              height={80}
            />
            {/* <pre className="text-2xl flex items-center font-bold text-[#3c4047]">
              <span className="text-3xl">/</span>Studio
            </pre> */}
          </div>
        )}
        {isActiveFileText && (
          <CodeEditor
            key={activeFile._id}
            fileName={activeFile.name}
            initialValue={activeFile.content}
            onChange={(content: string) => {
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
              }
              timeoutRef.current = setTimeout(() => {
                updateFile({ fileId: activeFile._id, content });
              }, DEBOUNCE_MS);
            }}
          />
        )}
        {isActiveFileBinary && <p>TODO: Implement binary preview</p>}
      </div>
    </div>
  );
};
