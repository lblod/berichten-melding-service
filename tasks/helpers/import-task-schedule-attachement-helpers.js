import {
  uuid,
  sparqlEscapeString,
  sparqlEscapeUri,
} from 'mu';
import { updateSudo as update } from '@lblod/mu-auth-sudo';
import * as env from '../../env';
import { attachClonedAuthenticationConfiguraton } from '../../lib/download-file-helpers';

export async function scheduleAttachments( { jobUri, taskUri, attachments } ) {
  // container
  const containerUuid = uuid();
  const containerUri = `http://data.lblod.info/id/container/${containerUuid}`;
  const containerTaskQuery = `
  ${env.PREFIXES}
  INSERT {
    GRAPH ?g {
      ${sparqlEscapeUri(containerUri)}
        a nfo:DataContainer ;
        mu:uuid ${sparqlEscapeString(containerUuid)}.
      ?task task:inputContainer ${sparqlEscapeUri(containerUri)}.
   }
  }
  WHERE {
     GRAPH ?g {
       VALUES ?task {
        ${sparqlEscapeUri(taskUri)}
       }
      ?task a task:Task.
     }
  }
  `;

  await update(containerTaskQuery);

  //harvesting collection
  const collectionUuid = uuid();
  const collectionUri = `http://data.lblod.info/id/harvest-collection/${collectionUuid}`;
  const collectionQuery = `
  ${env.PREFIXES}
  INSERT  {
    GRAPH ?g {
      ${sparqlEscapeUri(collectionUri)}
        a  hrvst:HarvestingCollection ;
        mu:uuid ${sparqlEscapeString(collectionUuid)}.

     ${sparqlEscapeUri(containerUri)} task:hasHarvestingCollection ${sparqlEscapeUri(collectionUri)}.
   }
  }
  WHERE {
     GRAPH ?g {
       VALUES ?task {
        ${sparqlEscapeUri(taskUri)}
       }
      ?task a task:Task.
     }
  }
  `;

  await update(collectionQuery);

  for(const remoteDataUri of Object.keys(attachments)) {

    const attachmentsTriples = attachments[remoteDataUri]
          .map(t => t.toNT())
          .join('\n');

    const newAuthConf = await attachClonedAuthenticationConfiguraton(
      remoteDataUri,
      jobUri
    );

    const remoteDataObjectQuery = `
       ${env.PREFIXES}
       INSERT {
         GRAPH ?g {
           ${attachmentsTriples}
           ${sparqlEscapeUri(remoteDataUri)}
             a nfo:RemoteDataObject,
               nfo:FileDataObject;
             rpioHttp:requestHeader
               <http://data.lblod.info/request-headers/accept/text/html>;
             mu:uuid ${sparqlEscapeString(uuid())};
             dct:creator ${sparqlEscapeUri(env.CREATOR)};
             adms:status
               <http://lblod.data.gift/file-download-statuses/ready-to-be-cached>.

          <http://data.lblod.info/request-headers/accept/text/html>
           a http:RequestHeader;
           http:fieldValue "text/html";
           http:fieldName "Accept";
           http:hdrName <http://www.w3.org/2011/http-headers#accept>.
         }
         GRAPH ?g {
           ${sparqlEscapeUri(collectionUri)} dct:hasPart ${sparqlEscapeUri(remoteDataUri)}.
         }
       }
       WHERE {
          GRAPH ?g {
            VALUES ?task {
             ${sparqlEscapeUri(taskUri)}
            }
           ?task a task:Task.
          }
       }
     `;
    await update(remoteDataObjectQuery);
  }
}
