import jsdom from 'jsdom';
import { analyse } from '@lblod/marawa/rdfa-context-scanner';
import { flatten } from 'lodash';
import { uniqWith } from 'lodash';
import Triple from './triple';

class RdfaExtractor {
  constructor(html, documentUrl) {
    this.html = html;
    this.documentUrl = documentUrl;
  }

  rdfa() {
    const dom = new jsdom.JSDOM(this.html);
    const domNode = dom.window.document.querySelector('body');

    const blocks = analyse(domNode, undefined, { documentUrl: this.documentUrl });
    const triples = flatten(blocks.map(b => b.context)).map(t => new Triple(t));
    this.triples = uniqWith(triples, (a, b) => a.isEqual(b));

    return this.triples;
  }

  add(triples) {
    const allTriples = (this.triples || []).concat(triples);
    this.triples = uniqWith(allTriples, (a, b) => a.isEqual(b));
  }

  ttl() {
    if (this.triples == undefined) {
      console.log('No triples found. Did you extract RDFa already?');
      return null;
    } else {
      return this.triples.map(t => {
        try {
          return t.toNT();
        }
        catch(e) {
          console.log(`rdfa extractor WARNING: invalid statement: <${t.subject}> <${t.predicate}> ${t.object}\n` + e);
          return "";
        }
      } ).join('\n');
    }
  }
}

export default RdfaExtractor;
