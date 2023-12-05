import Triple from '../../lib/triple';
export function extractEntities(triples, messageUri) {
  //message
  const message = sanitizeMessage(triples.filter(t => t.subject == messageUri));

  //attachments
  const attachmentSubjects = message
        .filter(
          t => t.subject == messageUri
            && t.predicate == 'http://www.semanticdesktop.org/ontologies/2007/01/19/nie#hasPart'
        )
        .map(t => t.object);
  const attachments = {};
  for(const subject of attachmentSubjects) {
    const isFile = triples.some(t =>
      t.subject == subject
        && ( t.predicate == 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' || t.predicate == 'a' )
        && t.object == 'http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#FileDataObject'
    );
    if(isFile) {
      attachments[subject] = sanitizeAttachment(triples.filter(t => t.subject == subject));
    }
  }

  // conversation (we extract them here as hasMany, we validate elsewhere)
  const conversationSubjects = triples
        .filter(
          t => t.predicate == 'http://schema.org/hasPart'
            && t.object == messageUri
        )
        .map(t => t.subject);
  const conversations = {};
  for(const subject of conversationSubjects) {
    const isConversation = triples.some(t =>
      t.subject == subject
        && ( t.predicate == 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' || t.predicate == 'a' )
        && t.object == 'http://schema.org/Conversation'
    );
    if(isConversation) {
      conversations[subject] = sanitizeConversation(triples.filter(t => t.subject == subject));
    }
  }
  return { message, attachments, conversations };
}

export function enrich({ message, rdfaExtractor }) {
  const messageUri = message[0].subject;
  //Add hardcoded 'Opvraging'
  message.push(new Triple({
    subject: messageUri,
    predicate: 'http://purl.org/dc/terms/type',
    object: "Reactie"
  }));

  // The text is extract as plain text. Most rdfa Extractors do this
  // Now, we're doing some trickery to extract the message as html
  // Thanks to the MARAWA package.
  let htmlTextmMessage = '';
  for(const block of rdfaExtractor.blocks) {
    const lastContext = block.context.slice(-1)[0];

    // We need the most specific context to fetch the matching DOMnode
    if(
      lastContext?.subject == messageUri
        &&
      lastContext?.predicate == 'http://schema.org/text'
    ) {
      htmlTextmMessage = block.semanticNode.domNode.innerHTML;
      break; //We only expect one block like this.
    }
  }
  // Now we have the html, we can replace the matching value in 'message'
  const messageContentTriple = message.find(t => t.predicate == 'http://schema.org/text');
  messageContentTriple.object = htmlTextmMessage;

}

function sanitizeConversation(triples) {
  const whitelist = [
    'a',
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
    'http://schema.org/hasPart',
    'http://schema.org/about',
    'http://schema.org/identifier'
  ];

  return triples.filter(t => whitelist.includes(t.predicate));
}

function sanitizeMessage(triples) {
  const whitelist = [
    'a',
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
    'http://www.semanticdesktop.org/ontologies/2007/01/19/nie#hasPart',
    'http://schema.org/sender',
    'http://schema.org/recipient',
    'http://schema.org/text',
    'http://schema.org/dateSent'
  ];

  return triples.filter(t => whitelist.includes(t.predicate));
}

function sanitizeAttachment(triples) {
  const whitelist = [
    'a',
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
    'http://purl.org/dc/terms/created',
    'http://www.semanticdesktop.org/ontologies/2007/01/19/nie#url',
    'http://purl.org/dc/terms/modified',
    'http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#fileName'
  ];

  return triples.filter(t => whitelist.includes(t.predicate));
}
