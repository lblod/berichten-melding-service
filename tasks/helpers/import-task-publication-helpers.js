import {
  uuid,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
  sparqlEscapeInt,
} from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import fs from 'fs-extra';
import * as env from '../../env';

export async function saveMessageAsAttachment({ taskUri, messageUri, message }) {
  // For legacy reasons, the orinal message should be saved as attachment in loket to be displayed in loket AND kalliope
  let msgContent = message.find(t => t.predicate == 'http://schema.org/text').object;
  msgContent = `
   <!DOCTYPE html>
   <html lang="en">
     <head>
      <meta charset="UTF-8">
      <title>Origineel Bericht</title>
     </head>
     <body>
       ${msgContent}
    </body>
  </html>
  `;

  const lFileUuid = uuid();
  const lFileUri = `http://data.lblod.info/file/id/${lFileUuid}`;
  const pFileUuid = uuid();
  const pFileUri = `share://${pFileUuid}.html`;
  const pFilePath = `/share/${pFileUuid}.html`;

  const nowSparql = sparqlEscapeDateTime(new Date().toISOString());

  await fs.writeFile(pFilePath, msgContent);
  const stats = await fs.stat(pFilePath);

  const updateMsgQuery = `
    ${env.PREFIXES}

     INSERT {
       GRAPH ?g {
        ${sparqlEscapeUri(lFileUri)}
          rdf:type nfo:FileDataObject ;
          dct:created ${nowSparql} ;
          dct:modified ${nowSparql} ;
          mu:uuid ${sparqlEscapeString(lFileUuid)} ;
          dct:creator ${sparqlEscapeUri(env.CREATOR)} ;
          nfo:fileName "origineel-bericht.html";
          nfo:fileSize ${sparqlEscapeInt(stats.size)};
          dbpedia:fileExtension ${sparqlEscapeString(".html")};
          dct:format ${sparqlEscapeString("text/html")}.

        ${sparqlEscapeUri(pFileUri)}
          rdf:type nfo:FileDataObject, nfo:LocalFileDataObject;
          dct:created ${nowSparql} ;
          dct:modified ${nowSparql} ;
          mu:uuid ${sparqlEscapeString(pFileUuid)} ;
          dct:creator ${sparqlEscapeUri(env.CREATOR)} ;
          nfo:fileName "origineel-bericht.html";
          nfo:fileSize ${sparqlEscapeInt(stats.size)};
          dbpedia:fileExtension ${sparqlEscapeString(".html")};
          dct:format ${sparqlEscapeString("text/html")};
          nie:dataSource ${sparqlEscapeUri(lFileUri)}.

         ${sparqlEscapeUri(messageUri)} nie:hasPart ${sparqlEscapeUri(lFileUri)}.
         ${sparqlEscapeUri(lFileUri)} skos:note "orginal-message-as-attachment-for-legacy".
       }
     }
     WHERE {
       GRAPH ?g {
        ${sparqlEscapeUri(taskUri)} a task:Task.
       }
     }`;

  await update(updateMsgQuery);
}

export async function updateMetaDataAttachment(attachments) {
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
       dct:format
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

export async function updateBerichtAndMessage({ taskUri, messageUri, message, conversations }) {
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
