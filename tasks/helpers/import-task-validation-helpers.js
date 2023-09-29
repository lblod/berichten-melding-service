import { sparqlEscapeUri } from 'mu';
import { querySudo as query } from '@lblod/mu-auth-sudo';
import { default as constraintForUri }  from "@lblod/submission-form-helpers";
import * as env from '../../env';

export async function validate({ message, attachments, conversations, organisationUri, vendorUri }) {
  if( message.length <= 0 ) {
    throw Error(`No message data found`);
  }

  // Basic checks, note; rest of the fields is checked implicitly.
  if(message.filter(t => t.predicate == 'http://schema.org/dateSent').length != 1) {
    throw Error(`Date sent missing or too many instances of date sent`);
  }

  if(!validateDatetime(message.find(t => t.predicate == 'http://schema.org/dateSent'))) {
    throw Error(`DateTime is not of valid format`);
  }

  if(message.filter(t => t.predicate == 'http://schema.org/text').length != 1) {
    throw Error(`Text missing or too many instances of text`);
  }

  if(Object.keys(conversations).length !== 1) {
    throw Error(`
      The number of conversation URIs should be 1, we found the following URI's:
      ${Object.keys(conversations).join('\n')}
    `);
  }
  const conversation = Object.keys(conversations)[0];

  const senders = message
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

  const recipients = message
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

    const messageExistsQuery = `
      ${env.PREFIXES}
      ASK {
       ${sparqlEscapeUri(message[0].subject)} ?p ?o.
      }
    `;

    // Async process forces us to do the check (even then in extreme conditions this won't be sufficient)
    const result = await query(messageExistsQuery);
    if(result?.boolean == true) {
      throw Error(`Message ${sparqlEscapeUri(message[0].subject)} already exists`);
    }
  }

  if(Object.keys(attachments).length) {
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

function validateDatetime(triple) {
  //we use the same validation as we use for the submissions/forms, to be consistent.
  const validateDateTime = constraintForUri('http://lblod.data.gift/vocabularies/forms/ValidDateTime');
  //some conversion :-/
  return validateDateTime({
    value: triple.object,
    datatype: { value: triple.datatype }
  });
}
