import { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useStore, useLibrary, usePlayback } from "../store";
import { Header } from "../components/Header";
import { SongList, type SongGroup } from "../components/SongList";
import { COLOR, ICON } from "../theme";
import { formatDuration } from "../../util/format";
import { deleteTracks } from "../../library/delete";
import { type Track } from "../../library/types";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execa } from "execa";

interface Mp3File {
  path: string;
  name: string;
  size: number;
}

export function Mp3() {
  const {
    library,
    config,
    playTrack,
    region,
    setSection,
    setCaptureMode,
    queue,
    playback,
    compact,
  } = useStore();
  useLibrary(library);
  const playbackState = usePlayback(playback);
  const playingId = playbackState.track?.id;
  const focused = region === "content";

  const [mp3Files, setMp3Files] = useState<Mp3File[]>([]);
  const [currentDir, setCurrentDir] = useState<string>("");
  const [confirm, setConfirm] = useState<{ path: string; name: string } | null>(null);

  useEffect(() => {
    loadMp3Files();
  }, [config.libraryDir]);

  const loadMp3Files = async () => {
    try {
      const mp3Dir = path.join(config.libraryDir, "mp3");
      const files: Mp3File[] = [];

      // Check if mp3 directory exists
      try {
        await fs.access(mp3Dir);
      } catch {
        setMp3Files([]);
        setCurrentDir(mp3Dir);
        return;
      }

      // Read mp3 directory
      const entries = await fs.readdir(mp3Dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // It's a playlist subdirectory
          const subDirPath = path.join(mp3Dir, entry.name);
          const subEntries = await fs.readdir(subDirPath);
          for (const subEntry of subEntries) {
            if (subEntry.endsWith(".mp3")) {
              const fullPath = path.join(subDirPath, subEntry);
              const stats = await fs.stat(fullPath);
              files.push({
                path: fullPath,
                name: subEntry,
                size: stats.size,
              });
            }
          }
        } else if (entry.name.endsWith(".mp3")) {
          // It's a direct mp3 file
          const fullPath = path.join(mp3Dir, entry.name);
          const stats = await fs.stat(fullPath);
          files.push({
            path: fullPath,
            name: entry.name,
            size: stats.size,
          });
        }
      }

      setMp3Files(files);
      setCurrentDir(mp3Dir);
    } catch (e) {
      console.error("Failed to load MP3 files:", e);
      setMp3Files([]);
    }
  };

  useEffect(() => {
    setCaptureMode(confirm ? "esc" : "none");
    return () => setCaptureMode("none");
  }, [confirm, setCaptureMode]);

  useInput(
    (input, key) => {
      if (key.escape) setConfirm(null);
      else if (input === "y" && confirm) {
        setConfirm(null);
        void (async () => {
          try {
            await fs.unlink(confirm.path);
            await loadMp3Files();
          } catch (e) {
            console.error("Failed to delete MP3:", e);
          }
        })();
      } else if (input === "o" && !confirm) {
        handleOpenFolder();
      }
    },
    { isActive: focused },
  );

  const handleOpenFolder = () => {
    const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    execa(command, [currentDir]).catch((e) => console.error("Failed to open folder:", e));
  };

  const handleDelete = (path: string, name: string) => {
    setConfirm({ path, name });
  };

  const toItem = (f: Mp3File) => ({
    value: f.path,
    title: f.name.replace(/\.mp3$/, ""),
    meta: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
  });

  const groups: SongGroup[] = [{ items: mp3Files.map(toItem) }];

  const subtitle = `${mp3Files.length} file${mp3Files.length === 1 ? "" : "s"}`;

  if (mp3Files.length === 0) {
    return (
      <Box flexDirection="column">
        <Header title="MP3" subtitle={subtitle} focused={focused} />
        <Text dimColor>No MP3 files found.</Text>
        <Text dimColor>Convert tracks from Library or Playlists to create MP3s.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header title="MP3" subtitle={subtitle} focused={focused} />
      <Box marginBottom={compact ? 0 : 1} flexShrink={0}>
        {confirm ? (
          <Text color={COLOR.warn} wrap="truncate-end">
            {`Delete '${confirm.name}'?  y Delete  ${ICON.dot}  esc Keep`}
          </Text>
        ) : (
          <Text dimColor wrap="truncate-end">
            {currentDir}  {ICON.dot}  Click to open folder
          </Text>
        )}
      </Box>
      <SongList
        groups={groups}
        playingId={playingId}
        focused={focused && !confirm}
        reserveRows={confirm ? 1 : 0}
        onDelete={(value) => {
          const file = mp3Files.find((f) => f.path === value);
          if (file) handleDelete(file.path, file.name);
        }}
        onSelect={(value) => {
          // For now, just open the folder on select
          // TODO: Add actual playback support for MP3 files
          handleOpenFolder();
        }}
      />
    </Box>
  );
}
