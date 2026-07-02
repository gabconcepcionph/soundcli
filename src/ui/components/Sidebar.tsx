import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useStore, type Section } from "../store";
import { wrapStep } from "../move";
import { ACCENT_RAMP, COLOR, ICON } from "../theme";

interface NavItem {
  key: Section;
  label: string;
}

const NAV: NavItem[] = [
  { key: "library", label: "Library" },
  { key: "playlists", label: "Playlists" },
  { key: "history", label: "History" },
  { key: "download", label: "Download" },
  { key: "mp3", label: "MP3" },
  { key: "settings", label: "Settings" },
];

export function Sidebar() {
  const { section, setSection, region, setRegion, queue, config } = useStore();
  const focused = region === "sidebar";
  const idx = NAV.findIndex((n) => n.key === section);
  const active = queue.activeCount;
  const [mp3Count, setMp3Count] = useState(0);

  useEffect(() => {
    const countMp3Files = async () => {
      try {
        const { promises: fs } = await import("node:fs");
        const path = await import("node:path");
        const mp3Dir = path.join(config.libraryDir, "mp3");
        let count = 0;

        try {
          await fs.access(mp3Dir);
          const entries = await fs.readdir(mp3Dir, { withFileTypes: true });

          for (const entry of entries) {
            if (entry.isDirectory()) {
              const subDirPath = path.join(mp3Dir, entry.name);
              const subEntries = await fs.readdir(subDirPath);
              count += subEntries.filter((e: string) => e.endsWith(".mp3")).length;
            } else if (entry.name.endsWith(".mp3")) {
              count++;
            }
          }
        } catch {
          // mp3 directory doesn't exist
        }

        setMp3Count(count);
      } catch (e) {
        console.error("Failed to count MP3 files:", e);
      }
    };

    countMp3Files();
  }, [config.libraryDir]);

  useInput(
    (_input, key) => {
      if (key.upArrow) setSection(NAV[wrapStep(idx, -1, NAV.length)]!.key);
      else if (key.downArrow)
        setSection(NAV[wrapStep(idx, 1, NAV.length)]!.key);
      else if (key.return) setRegion("content");
    },
    { isActive: focused },
  );

  return (
    <Box flexDirection="column" width={20} marginRight={1}>
      {NAV.map((item) => {
        const selected = item.key === section;
        // Settings is a utility, so set it off from the content sections.
        const pinned = item.key === "settings";
        return (
          <Box key={item.key} marginTop={pinned ? 1 : 0}>
            {selected ? (
              // The lit edge: the marker takes the ramp's sunlit end while the
              // label stays brand flame, a subtle two-tone glow.
              <Text color={ACCENT_RAMP[1]} bold={focused}>{`${ICON.bar} `}</Text>
            ) : (
              <Text>{"  "}</Text>
            )}
            <Text
              color={selected ? COLOR.accent : undefined}
              dimColor={!selected}
              bold={selected && focused}
            >
              {item.label}
            </Text>
            {item.key === "download" && active > 0 ? (
              <Text dimColor>{` (${active})`}</Text>
            ) : item.key === "mp3" && mp3Count > 0 ? (
              <Text dimColor>{` (${mp3Count})`}</Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
