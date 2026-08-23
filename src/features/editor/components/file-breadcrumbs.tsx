import React from "react";
import { FileIcon } from "@react-symbols/icons/utils";

import { useFilePath } from "@/features/projects/hooks/use-files";
import { useEditor } from "@/features/editor/hooks/use-editor";
import { Id } from "../../../../convex/_generated/dataModel";

import {
  Breadcrumb,
  BreadcrumbPage,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface FileBreadcrumbsProps {
  projectId: Id<"projects">;
}
export const FileBreadcrumbs = ({ projectId }: FileBreadcrumbsProps) => {
  const { activeTabId } = useEditor(projectId);
  const filePath = useFilePath(activeTabId);

  if (filePath === undefined || !activeTabId) {
    return (
      <div className="p-2 bg-background pl-4 border-b">
        <Breadcrumb>
          <BreadcrumbList className="sm:gap-0.5 gap-0.5">
            <BreadcrumbItem className="text-sm">
              <BreadcrumbPage>&nbsp;</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    );
  }
  return (
    <div className="p-2 bg-background pl-4 border-b">
      <Breadcrumb>
        <BreadcrumbList className="sm:gap-0.5 gap-0.5 flex-nowrap">
          {filePath.map((item, index) => {
            const isLast = index === filePath.length - 1;
            return (
              <React.Fragment key={item._id}>
                <BreadcrumbItem className="text-sm">
                  {isLast ? (
                    <BreadcrumbPage className="flex items-center gap-1">
                      <FileIcon
                        fileName={item.name}
                        autoAssign
                        className="size-3.5 mt-1!"
                      />
                      {item.name}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href="#">{item.name}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator className="mt-1!" />}
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
};
