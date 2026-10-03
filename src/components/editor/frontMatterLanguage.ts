import { yamlLanguage } from '@codemirror/lang-yaml';
import {
  defineLanguageFacet,
  Language,
  LanguageSupport,
  languageDataProp,
} from '@codemirror/language';
import {
  type Input,
  NodeSet,
  NodeType,
  Parser,
  type PartialParse,
  parseMixed,
  Tree,
  type TreeFragment,
} from '@lezer/common';
import { styleTags, tags } from '@lezer/highlight';
import { frontMatterEnd } from '@/domain/frontMatter';

/**
 * The text pane's language: Markdown, with YAML front matter parsed as
 * YAML. `@codemirror/lang-yaml`'s own wrapper finds front matter with a
 * fixed grammar that only knows an exact `---` closed by `---`, so a
 * Pandoc `...` closer made it parse the whole body as YAML, and trailing
 * spaces on the opening fence made the metadata a setext heading. This
 * finds it with `frontMatterEnd`, the rule the visual pane and exports use,
 * and mounts the YAML and Markdown parsers on the parts.
 */

const data = defineLanguageFacet();

const NODES = new NodeSet([
  NodeType.define({
    id: 0,
    name: 'FrontMatterDocument',
    top: true,
    props: [[languageDataProp, data]],
  }),
  NodeType.define({ id: 1, name: 'FrontMatterMark' }),
  NodeType.define({ id: 2, name: 'FrontMatterContent' }),
  NodeType.define({ id: 3, name: 'Body' }),
]).extend(styleTags({ FrontMatterMark: tags.meta }));

const [TOP, MARK, CONTENT, BODY] = NODES.types as [NodeType, NodeType, NodeType, NodeType];

/** The whole document's outline: fences, YAML and body, built in one step. */
function outline(input: Input): Tree {
  const length = input.length;
  const text = input.read(0, length);
  const end = frontMatterEnd(text);
  if (end < 0) return new Tree(TOP, [new Tree(BODY, [], [], length)], [0], length);
  const firstBreak = text.indexOf('\n');
  const closeStart = text.lastIndexOf('\n', end - 1) + 1;
  const contentFrom = firstBreak + 1;
  const contentTo = Math.max(contentFrom, closeStart - 1);
  const bodyFrom = Math.min(end + 1, length);
  const parts: Array<[Tree, number]> = [
    [new Tree(MARK, [], [], firstBreak), 0],
    [new Tree(CONTENT, [], [], contentTo - contentFrom), contentFrom],
    [new Tree(MARK, [], [], end - closeStart), closeStart],
    [new Tree(BODY, [], [], length - bodyFrom), bodyFrom],
  ];
  return new Tree(
    TOP,
    parts.map(([tree]) => tree),
    parts.map(([, from]) => from),
    length
  );
}

/** The outline needs no incremental work: it is built whole in one step. */
class WholeParse implements PartialParse {
  parsedPos = 0;
  stoppedAt: number | null = null;

  constructor(private readonly input: Input) {}

  advance(): Tree {
    this.parsedPos = this.input.length;
    return outline(this.input);
  }

  stopAt(pos: number): void {
    this.stoppedAt = pos;
  }
}

class FrontMatterParser extends Parser {
  constructor(private readonly nest: ReturnType<typeof parseMixed>) {
    super();
  }

  createParse(
    input: Input,
    fragments: readonly TreeFragment[],
    ranges: readonly { from: number; to: number }[]
  ): PartialParse {
    const whole = new WholeParse(input);
    // The YAML and the body are parsed by their own parsers, the body
    // incrementally from the previous tree's fragments.
    return this.nest(whole, input, fragments, ranges);
  }
}

export function markdownWithFrontMatter(markdown: LanguageSupport): LanguageSupport {
  const parser = new FrontMatterParser(
    parseMixed((node) =>
      node.type === CONTENT
        ? { parser: yamlLanguage.parser }
        : node.type === BODY
          ? { parser: markdown.language.parser }
          : null
    )
  );
  return new LanguageSupport(new Language(data, parser, [], 'markdown'), markdown.support);
}
