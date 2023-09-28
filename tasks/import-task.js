import {
  uuid,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';
import { querySudo as query } from '@lblod/mu-auth-sudo';
import fs from 'fs-extra';
import { updateStatus } from '../lib/task-utils';
import { parseResult } from '../support';
import * as env from '../env';
import RdfaExtractor from '../lib/rdfa-extractor';
import Triple from '../lib/triple';


export async function startTask(taskUri) {
  //lock first
  await updateStatus(taskUri, env.TASK_STATUSES.busy);

  const data  = await getInterestingDataFromTask(taskUri);
  if(!data) {
    throw new Error('Not all data found');
  }
  const { pFile, url, berichtUri, organisationUri, vendorUri } = data;
  const html = await loadFileData(pFile);
  const rdfaExtractor = new RdfaExtractor(html, url);
  rdfaExtractor.parse();
  const { bericht, attachments, conversations } =
        extractEntities(rdfaExtractor.triples, berichtUri);

  await validate({ bericht, attachments, conversations, organisationUri, vendorUri });

  enrich({ bericht, attachments, rdfaExtractor });






  // parse the file and extract the schema:Message
  // store the message + attachements
  // schedule the attchments
}

export async function updateTaskOndownloadEvent(job, task, downloadStatus) {
  if(downloadStatus == env.DOWNLOAD_STATUSES.failure) {
    // store error
    // fail task
  }
  else if(downloadStatus == env.DOWNLOAD_STATUSES.success) {
    //if stuff left, wait
    //else set to success
  }
}

async function getInterestingDataFromTask(task) {
  const queryStr = `
   ${env.PREFIXES}
   SELECT DISTINCT ?pFile ?url ?berichtUri ?organisationUri ?vendorUri WHERE {
     GRAPH ?g {
       VALUES ?task {
          ${sparqlEscapeUri(task)}
       }
       ?task a task:Task;
         task:inputContainer ?container.

       ?container task:hasHarvestingCollection ?collection;
         dct:subject ?berichtUri;
         schema:sender ?organisationUri;
         pav:providedBy ?vendorUri.

       ?collection dct:hasPart ?remoteDataObject.

       ?remoteDataObject nie:url ?url.
       ?pFile nie:dataSource ?remoteDataObject.
    }
   }
   LIMIT 1
  `;
  const response = await query(queryStr);
  return parseResult(response)[0];
}

async function loadFileData(fileUri){
  console.log(`Getting contents of file ${fileUri}`);
  const path = fileUri.replace('share://', '/share/');
  const content = await fs.readFile(path, 'utf-8');
  return content;
}

function extractEntities(triples, berichtUri) {
  //bericht
  const bericht = triples
        .filter(t => t.subject == berichtUri);

  //attachments
  const attachmentSubjects = bericht
        .filter(
          t => t.subject == berichtUri
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
      attachments[subject] = triples.filter(t => t.subject == subject);
    }
  }

  // conversation (we extract them here as hasMany, we validate elsewhere)
  const conversationSubjects = triples
        .filter(
          t => t.predicate == 'http://schema.org/hasPart'
            && t.object == berichtUri
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
      conversations[subject] = triples.filter(t => t.subject == subject);
    }
  }
  return { bericht, attachments, conversations };
}

async function validate({ bericht, attachments, conversations, organisationUri, vendorUri }) {
  if( bericht.length <= 0 ) {
    throw Error(`No message data found`);
  }

  // Basic checks, note; rest of the fields is checked implicitly.
  if(bericht.filter(t => t.predicate == 'http://schema.org/dateSent').length != 1) {
    throw Error(`Date sent missing or too many instances of date sent`);
  }

  if(bericht.filter(t => t.predicate == 'http://schema.org/text').length != 1) {
    throw Error(`Text missing or too many instances of text`);
  }

  if(Object.keys(conversations).length !== 1) {
    throw Error(`
      The number of conversation URIs should be 1, we found the following URI's:
      ${Object.keys(conversations).join('\n')}
    `);
  }
  const conversation = Object.keys(conversations)[0];

  const senders = bericht
        .filter(t => t.predicate == 'http://schema.org/sender')
        .map(t => t.object);

  if(senders.length != 1) {
    throw Error(`
      Number of senders should be 1, not ${senders.join('\n')}`);
  }

  if(senders[0] !== organisationUri) {
    throw Error(`
      ${organisationUri} is not the same as found in message sender ${senders[0]}`);
  }

  const sender = senders[0];

  const recipients = bericht
        .filter(t => t.predicate == 'http://schema.org/recipient')
        .map(t => t.object);

  if(recipients.length != 1) {
    throw Error(`
      Number of recipients should be 1, not ${recipients.join('\n')}`);
  }

  const recipient = recipients[0];

  // check the sender in the message, since async process we have to do a similar check, but on the content of the message
  const checkSenderStr = `
    ${env.PREFIXES}
    ASK {
      ${sparqlEscapeUri(vendorUri)} muAccount:canActOnBehalfOf ${sparqlEscapeUri(sender)}
    }
  `;
  const result = await query(checkSenderStr);

  if(!result.boolean) {
    throw Error(`
      Vendor ${sparqlEscapeUri(vendorUri)} can't act on behalf of ${sparqlEscapeUri(sender)}`);
  }

  if(sender == env.ABB_URI) {
    // the validation changes if ABB is the sender
    const isNewConversationQuery = `
      ${env.PREFIXES}
      ASK {
       ${sparqlEscapeUri(conversation)} ?p ?o.
      }
    `;
    const result = await query(isNewConversationQuery);
    if(result?.boolean == true) {
      throw Error(`Conversation ${sparqlEscapeUri(conversation)} already exists`);
    }
    // TODO: more checks needed?
  }
  else {

    if(recipient != env.ABB_URI) {
      throw Error(`
        Only ABB (${env.ABB_URI}) is allowed as recipient`);
    }

    const berichtExistsQuery = `
      ${env.PREFIXES}
      ASK {
       ${sparqlEscapeUri(bericht[0].subject)} ?p ?o.
      }
    `;

    // Async process forces us to do the check (even then in extreme conditions this won't be sufficient)
    const result = await query(berichtExistsQuery);
    if(result?.boolean == true) {
      throw Error(`Bericht ${sparqlEscapeUri(bericht[0].subject)} already exists`);
    }
  }

  if(attachments.length) {
    const attachmentsQuery = `
      ${env.PREFIXES}
      ASK {
        VALUES ?attachment {
          ${Object.keys(attachments)
            .map(a => sparqlEscapeUri(a))
            .join('\n')
           }
        }
        ?attachment ?p ?o
      }
    `;
    const result = await query(attachmentsQuery);
    if(result?.boolean == true) {
      throw Error(`Some of the attachments already exists`);
    }
  }

}

function enrich({ bericht, attachments, rdfaExtractor }) {
  const berichtUri = bericht[0].subject;
  bericht.push(
    new Triple(
      berichtUri,
      'http://mu.semte.ch/vocabularies/core/uuid',
      uuid()
    ));

  // The text is extract as plain text. Most rdfa Extractors do this
  // Now, we're doing some trickery to extract the message as html
  // Thanks to the MARAWA package.
  let htmlTextmMessage = '';
  for(const block of rdfaExtractor.blocks) {
    const lastContext = block.context.slice(-1)[0];

    // We need the most specific context to fetch the matching DOMnode
    if(
      lastContext?.subject == berichtUri
        &&
      lastContext?.predicate == 'http://schema.org/text'
    ) {
      htmlTextmMessage = block.semanticNode.domNode.innerHTML;
      break; //We only expect one block like this.
    }
  }
  // Now we have the html, we can replace the matching value in 'bericht'
  const message = bericht.find(t => t.predicate == 'http://schema.org/text');
  message.object = htmlTextmMessage;

  for(const key of Object.keys(attachments)) {
    attachments[key].push(
      new Triple(
        key,
        'http://mu.semte.ch/vocabularies/core/uuid',
        uuid()
      ));
  }
}
