// Base padding for root level items (after project header)
export const BASE_PADDING = 12;
// Additional padding per nesting level
export const LEVEL_PADDING = 12;

export const getItemPadding = (level: number, isFile: boolean) => {
  // Files need extra padding since they don't have the chevron
  const fileOffset = isFile ? 16 : 0;
  return BASE_PADDING + level * LEVEL_PADDING + fileOffset;
  // 12 + (1*12) + 16 = 12+12+16 = 40px (file level 1)
  // 12 + (2*12) + 16 = 12+24+16 = 52px (file level 2)

  // 12 + (1*12) + 0 = 12+12+0 = 24px (folder level 1)
  // 12 + (2*12) + 0 = 12+24+0 = 36px (folder level 2)
};

//#region getItemPadding
/*
Root Level (level 0)
└[>]📁 Folder 1 (root level) -- no level padding
    └── paddingLeft = 12 + (0 * 12) + 0 = 12px

    ├[>]📁 Subfolder (level 1)
    │    └── paddingLeft = 12 + (1 * 12) + 0 = 24px
    │
    │   ├[>]📁 Components (level 2)
    │   │    └──paddingLeft = 12 + (2 * 12) + 0 = 36px
    │   │
    │   └[ ]📄 index.tsx (level 2)
    │        └──paddingLeft = 12 + (2 * 12) + 16 = 56px
    │
    └[ ]📄 package.json (level 1)
         └── paddingLeft = 12 + (1 * 12) + 16 = 40px
*/
//#endregion
