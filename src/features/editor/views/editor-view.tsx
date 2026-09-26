import { useFile, useUpdateFile } from "@/features/projects/hooks/use-files";
import { Id } from "../../../../convex/_generated/dataModel";
import { FileBreadcrumbs } from "../components/file-breadcrumbs";
import { TopNavigation } from "../components/top-navigation";
import { useEditor } from "../hooks/use-editor";
import Image from "next/image";
import { CodeEditor } from "../components/code-editor";
import { useEffect, useRef } from "react";
import { AlertTriangleIcon } from "lucide-react";

// Extensions every browser can render in an <img> tag.
const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "svg",
  "bmp",
  "ico",
];

const isImageFileName = (name: string) => {
  const extension = name.split(".").pop()?.toLowerCase();
  return !!extension && IMAGE_EXTENSIONS.includes(extension);
};

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

  // #region Previewable binaries
  // Binary files are held in Convex storage, and `getFile` hands us a served URL
  // for them. Images are worth rendering rather than refusing — only the formats
  // the browser has no <img> decoder for fall through to the warning below.
  // #endregion
  const isActiveFileImage =
    isActiveFileBinary &&
    !!activeFile.storageUrl &&
    isImageFileName(activeFile.name);

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
              //Baked-in dark grey: already faint on dark, faded to match on light
              className="opacity-15 dark:opacity-100"
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
            value={activeFile.content}
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
        {isActiveFileImage && (
          <div className="size-full overflow-auto flex items-center justify-center p-6">
            {/* Convex storage URLs are signed and short-lived, so next/image
                optimisation has nothing stable to cache — serve them directly. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={activeFile._id}
              src={activeFile.storageUrl!}
              alt={activeFile.name}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        )}
        {isActiveFileBinary && !isActiveFileImage && (
          <div className="size-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-2.5 max-w-md text-center">
              <AlertTriangleIcon className="size-10 text-yellow-500" />
              <p className="text-sm">
                The file is not displayed in the text editor because it is
                either binary or uses an unsupported text encoding.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
