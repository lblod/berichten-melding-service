import {
  uuid,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import fs from 'fs-extra';
import * as env from '../../env';

export async function updateMetaDataAttachment(attachments){
  // adds some file meta-data to the logical file deduced from the physical file
  // See https://chat.semte.ch/channel/mu-semtech?msg=oSqRuhr5Fji87aWat
  // as to why this should not be done in by the remote-url service
  const attachmentsUri = Object.keys(attachments)
        .map(uri => sparqlEscapeUri(uri));
  const updateAttachQuery = `
  ${env.PREFIXES}

  INSERT {
    GRAPH ?g {
     ?attachment ?predicateForUpdate ?object.
    }
   }
   WHERE {
     VALUES ?attachment {
       ${attachmentsUri.join('\n')}
     }

     VALUES ?predicateForUpdate {
       nfo:fileSize
       dbpedia:fileExtension
     }

     GRAPH ?g {
      ?pfile nie:dataSource ?attachment;
        ?predicateForUpdate ?object;
        a nfo:FileDataObject.
      }
   }
  `;
  await update(updateAttachQuery);
}

export async function updateBerichtAndMessage({ taskUri, messageUri, message, conversations }){
  const conversationUri = Object.keys(conversations)[0];
  const conversation = conversations[conversationUri];

  // updates bericht and conversation
  const publishQueryStr = `
    ${env.PREFIXES}
    DELETE {
      GRAPH ?g {
        ?conversation ext:lastMessage ?o.
      }
    }
    WHERE {
      VALUES ?conversation {
        ${sparqlEscapeUri(conversationUri)}
      }
      GRAPH ?g {
        ?conversation ext:lastMessage ?o.
      }
    }
    ;
    INSERT {
      GRAPH ?g {
        ${sparqlEscapeUri(messageUri)} mu:uuid ${sparqlEscapeString(uuid())}.
        ${message.map(t => t.toNT()).join('\n') }
        ${conversation.map(t => t.toNT()).join('\n') }
        ${sparqlEscapeUri(conversationUri)} ext:lastMessage ${sparqlEscapeUri(messageUri)}.
     }
    }
    WHERE {
      VALUES ?task {
       ${sparqlEscapeUri(taskUri)}
      }
      GRAPH ?g {
        ?task a task:Task.
     }
    }
  `;
  await update(publishQueryStr);
}
