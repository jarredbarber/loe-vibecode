"""
Replace Pelican's default MarkdownReader (which hardcodes the legacy
`markdown.extensions.meta` extension) with one that uses
`markdown_full_yaml_metadata` so we can write proper YAML frontmatter:

  ---
  title: Spring "Bursts" Forth
  date: 2026-05-22
  ---

Why this matters: Decap-style CMSs write YAML, and Meta can't represent
quoted strings, dates, or nested values. See INGEST.md for the emit side.
"""

from markdown import Markdown
from pelican import signals
from pelican.readers import MarkdownReader
from pelican.utils import pelican_open


class YamlMarkdownReader(MarkdownReader):
    """Same as MarkdownReader but uses full_yaml_metadata instead of meta."""

    def __init__(self, *args, **kwargs):
        # Skip MarkdownReader.__init__'s unconditional meta-extension append by
        # calling its parent (BaseReader.__init__) directly.
        super(MarkdownReader, self).__init__(*args, **kwargs)
        settings = self.settings["MARKDOWN"]
        settings.setdefault("extension_configs", {})
        settings.setdefault("extensions", [])
        for extension in settings["extension_configs"].keys():
            if extension not in settings["extensions"]:
                settings["extensions"].append(extension)
        if "full_yaml_metadata" not in settings["extensions"]:
            settings["extensions"].append("full_yaml_metadata")
        # Drop legacy meta if a user accidentally left it in MARKDOWN config —
        # it would conflict by consuming the frontmatter first.
        if "markdown.extensions.meta" in settings["extensions"]:
            settings["extensions"].remove("markdown.extensions.meta")
        self._source_path = None

    def read(self, source_path):
        self._source_path = source_path
        # Build a clean Markdown config per-read. The shared settings dict can
        # be mutated by other MarkdownReader instances Pelican initializes,
        # which would re-introduce markdown.extensions.meta and let it consume
        # our YAML frontmatter before full_yaml_metadata sees it.
        md_settings = dict(self.settings["MARKDOWN"])
        exts = [e for e in md_settings.get("extensions", []) if e != "markdown.extensions.meta"]
        if "full_yaml_metadata" not in exts:
            exts.append("full_yaml_metadata")
        md_settings["extensions"] = exts
        self._md = Markdown(**md_settings)
        with pelican_open(source_path) as text:
            content = self._md.convert(text)

        raw_meta = getattr(self._md, "Meta", None) or {}
        # full_yaml_metadata stores plain values (str, list, dict, date, etc.).
        # Pelican's _parse_metadata expects a Meta-style dict[str, list[str]]
        # so it can pull value[0]. Wrap scalars in single-item lists; keep
        # actual lists as lists of strings.
        wrapped = {}
        for k, v in raw_meta.items():
            if isinstance(v, list):
                wrapped[k] = [str(x) for x in v]
            else:
                wrapped[k] = [str(v)]

        return content, self._parse_yaml_metadata(wrapped)

    def _parse_yaml_metadata(self, meta):
        # _parse_metadata calls preprocessors.deregister('meta'), which raises
        # if the meta preprocessor isn't registered. Skip that step.
        formatted_fields = self.settings["FORMATTED_FIELDS"]
        output = {}
        for name, value in meta.items():
            name = name.lower()
            if name in formatted_fields:
                self._md.reset()
                formatted = self._md.convert("\n".join(value))
                output[name] = self.process_metadata(name, formatted)
            elif len(value) > 1:
                output[name] = self.process_metadata(name, value)
            else:
                output[name] = self.process_metadata(name, value[0])
        return output


def _swap_reader(readers):
    readers.reader_classes["md"] = YamlMarkdownReader
    readers.reader_classes["markdown"] = YamlMarkdownReader


def register():
    signals.readers_init.connect(_swap_reader)
