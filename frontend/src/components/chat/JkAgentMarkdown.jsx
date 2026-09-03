import { Box, Stack, Typography } from "@mui/material";

/**
 * Parses inline formatting like bold, italic, and inline code.
 *
 * @param {string} text
 * @returns {import("react").ReactNode[]}
 */
function renderInlineFormatting(text) {
  // Tokenize bold (**text**), inline code (`text`), and italic (*text*)
  const tokens = [];
  const regex = /(\*\*.*?\*\*|`.*?`|\*.*?\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }

    const matchedStr = match[0];
    if (matchedStr.startsWith("**") && matchedStr.endsWith("**")) {
      tokens.push(
        <Box
          key={`bold-${match.index}`}
          component="strong"
          sx={{ fontWeight: 600 }}
        >
          {matchedStr.slice(2, -2)}
        </Box>,
      );
    } else if (matchedStr.startsWith("`") && matchedStr.endsWith("`")) {
      tokens.push(
        <Box
          key={`code-${match.index}`}
          component="code"
          sx={{
            px: 0.6,
            py: 0.2,
            borderRadius: 0.75,
            bgcolor: "action.hover",
            fontFamily: "monospace",
            fontSize: "0.88em",
          }}
        >
          {matchedStr.slice(1, -1)}
        </Box>,
      );
    } else if (matchedStr.startsWith("*") && matchedStr.endsWith("*")) {
      tokens.push(
        <Box
          key={`italic-${match.index}`}
          component="em"
          sx={{ fontStyle: "italic" }}
        >
          {matchedStr.slice(1, -1)}
        </Box>,
      );
    }

    lastIndex = match.index + matchedStr.length;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens.length > 0 ? tokens : [text];
}

/**
 * Lightweight, zero-dependency Markdown renderer for chat messages.
 * Formats bullet points, numbered lists, headings, and bold text.
 *
 * @param {{ content: string }} props
 */
export default function JkAgentMarkdown({ content }) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements = [];
  let currentList = null;

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();

    // Empty line separates paragraphs / lists
    if (!trimmed) {
      if (currentList) {
        elements.push(currentList);
        currentList = null;
      }
      return;
    }

    // Bulleted list item (- or *)
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (!currentList || currentList.type !== "ul") {
        if (currentList) elements.push(currentList);
        currentList = { type: "ul", items: [] };
      }
      currentList.items.push(
        <Stack
          key={`li-${lineIndex}`}
          direction="row"
          spacing={1}
          alignItems="flex-start"
          sx={{ my: 0.3 }}
        >
          <Box
            component="span"
            sx={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              bgcolor: "primary.main",
              mt: 1.1,
              flexShrink: 0,
            }}
          />
          <Typography variant="body2" sx={{ lineHeight: 1.55 }}>
            {renderInlineFormatting(bulletMatch[1])}
          </Typography>
        </Stack>,
      );
      return;
    }

    // Numbered list item (1. or 2.)
    const numberMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberMatch) {
      if (!currentList || currentList.type !== "ol") {
        if (currentList) elements.push(currentList);
        currentList = { type: "ol", items: [] };
      }
      currentList.items.push(
        <Stack
          key={`oli-${lineIndex}`}
          direction="row"
          spacing={1}
          alignItems="flex-start"
          sx={{ my: 0.3 }}
        >
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: "primary.main",
              width: 18,
              flexShrink: 0,
              pt: 0.2,
            }}
          >
            {numberMatch[1]}.
          </Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.55 }}>
            {renderInlineFormatting(numberMatch[2])}
          </Typography>
        </Stack>,
      );
      return;
    }

    // Normal paragraph or heading line
    if (currentList) {
      elements.push(currentList);
      currentList = null;
    }

    // Heading simulation (### or bold-only title)
    if (trimmed.startsWith("### ")) {
      elements.push(
        <Typography
          key={`h3-${lineIndex}`}
          variant="subtitle2"
          sx={{ fontWeight: 700, mt: 1, mb: 0.5, color: "text.primary" }}
        >
          {renderInlineFormatting(trimmed.replace(/^###\s+/, ""))}
        </Typography>,
      );
    } else {
      elements.push(
        <Typography
          key={`p-${lineIndex}`}
          variant="body2"
          sx={{ lineHeight: 1.55, my: 0.5, color: "inherit" }}
        >
          {renderInlineFormatting(line)}
        </Typography>,
      );
    }
  });

  if (currentList) {
    elements.push(currentList);
  }

  return (
    <Box sx={{ "& > :first-of-type": { mt: 0 }, "& > :last-child": { mb: 0 } }}>
      {elements.map((el, idx) => {
        if (el.items) {
          return (
            <Stack key={`list-${idx}`} sx={{ my: 0.75, pl: 0.5 }}>
              {el.items}
            </Stack>
          );
        }
        return el;
      })}
    </Box>
  );
}
