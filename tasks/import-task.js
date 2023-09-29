import {
  uuid,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import fs from 'fs-extra';
import { updateStatus } from '../lib/task-utils';
import { parseResult } from '../support';
import * as env from '../env';
import RdfaExtractor from '../lib/rdfa-extractor';
import Triple from '../lib/triple';
import { attachClonedAuthenticationConfiguraton } from '../lib/download-file-helpers';
import { validate } from './helpers/import-task-validation-helpers';
import { extractEntities, enrich }  from './helpers/import-task-extracting-helpers';
import { scheduleAttachments }  from './helpers/import-task-schedule-attachement-helpers';
import { updateMetaDataAttachment, updateBerichtAndMessage } from './helpers/import-task-publication-helpers';

export async function startTask(taskUri) {
  //lock first
  await updateStatus(taskUri, env.TASK_STATUSES.busy);

  const data  = await getInterestingDataFromTask(taskUri);
  if(!data) {
    throw new Error('Not all data found');
  }
  const { pFile, url, messageUri, organisationUri, vendorUri, jobUri } = data;
  const html = await loadFileData(pFile);
  const rdfaExtractor = new RdfaExtractor(html, url);
  rdfaExtractor.parse();
  const { message, attachments, conversations } =
        extractEntities(rdfaExtractor.triples, messageUri);

  await validate({ message, attachments, conversations, organisationUri, vendorUri });

  //schedule the attachments
  await scheduleAttachments({ jobUri, taskUri, attachments });
  // We wait until all attachments are correctly downloaded, before publish the message to loket.
}

export async function updateTaskOndownloadEvent(job,
                                                task,
                                                downloadStatus,
                                                fileUri,
                                                collectionUri
                                               ) {

  const statusesData = await getAllDownloadsStatus(collectionUri);

  if(!areAllDownloadsFinalState(statusesData)) {
    console.log(`
      Task ${task} with collection ${collectionUri} has downloads still in need of processing.
      Doing nothing...
   `);
  }
  else {
    if(didAnyDownloadFail(statusesData)) {
      // clean up attachments
    }
    else {
      await publishMessage(task);
      await updateStatus(task, env.TASK_STATUSES.success);
    }
  }
  //clean up on general fail
  // extract to file
  // error sit flow
  // kalliope creates conversation flow
}

async function publishMessage(taskUri){
  const data  = await getInterestingDataFromTask(taskUri);
  if(!data) {
    throw new Error('Unexpected error while publishing message: no data found');
  }
  const { pFile, url, messageUri, organisationUri, vendorUri, jobUri } = data;
  const html = await loadFileData(pFile);
  const rdfaExtractor = new RdfaExtractor(html, url);
  rdfaExtractor.parse();
  const { message, attachments, conversations } =
        extractEntities(rdfaExtractor.triples, messageUri);
  enrich({ message, attachments, conversations, rdfaExtractor });
  await updateMetaDataAttachment(attachments);
  await updateBerichtAndMessage({ taskUri, messageUri, message, conversations });

}

function areAllDownloadsFinalState(statusesData) {
  const statuses = statusesData.map(o => o.status);
  const finalStatuses = [
    env.DOWNLOAD_STATUSES.failure,
    env.DOWNLOAD_STATUSES.success
  ];
  const filtered = statuses.filter(status => finalStatuses.includes(status));
  return filtered.length == statuses.length;
}

function didAnyDownloadFail(statusesData){
  return statusesData
    .map(o => o.status)
    .some(s => s == env.DOWNLOAD_STATUSES.failure);
}

async function getAllDownloadsStatus(collectionUri) {
  const queryStr = `
    ${env.PREFIXES}
    SELECT DISTINCT ?remoteDataObject ?status WHERE {

      VALUES ?collection {
        ${sparqlEscapeUri(collectionUri)}
      }
      ?collection dct:hasPart ?remoteDataObject.

      ?remoteDataObject a nfo:RemoteDataObject;
        adms:status ?status.
    }
  `;
  return parseResult(await query(queryStr));
}

async function getInterestingDataFromTask(task) {
  const queryStr = `
   ${env.PREFIXES}
   SELECT DISTINCT ?jobUri ?pFile ?url ?messageUri ?organisationUri ?vendorUri WHERE {
     GRAPH ?g {
       VALUES ?task {
          ${sparqlEscapeUri(task)}
       }
       ?task a task:Task;
         task:inputContainer ?container;
         dct:isPartOf ?jobUri.

       ?container task:hasHarvestingCollection ?collection;
         dct:subject ?messageUri;
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
