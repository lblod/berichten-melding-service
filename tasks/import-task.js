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


export async function startTask(taskUri) {
  //lock first
  await updateStatus(taskUri, env.TASK_STATUSES.busy);

  const data  = await getSourceFileData(taskUri);
  if(!data) {
    throw new Error('No file found');
  }
  const { pFile, url } = data;
  const html = await loadFileData(pFile);
  const rdfaExtractor = new RdfaExtractor(html, url);
  const rdfaData = rdfaExtractor.rdfa();

  // load the html file
  // parse the file and extract the schema:Message
  // store the message + attachements
  // schedule the attchments
}

export async function updateTask(job, task, downloadStatus) {
  if(downloadStatus == env.DOWNLOAD_STATUSES.failure) {
    // store error
    // fail task
  }
  else if(downloadStatus == env.DOWNLOAD_STATUSES.success) {
    //if stuff left, wait
    //else set to success
  }
}

async function getSourceFileData(task) {
  const queryStr = `
   ${env.PREFIXES}
   SELECT DISTINCT ?pFile ?url WHERE {
     GRAPH ?g {
       VALUES ?task {
          ${sparqlEscapeUri(task)}
       }
       ?task a task:Task;
         task:inputContainer ?container.

       ?container task:hasHarvestingCollection ?collection.
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

export async function loadFileData(fileUri){
  console.log(`Getting contents of file ${fileUri}`);
  const path = fileUri.replace('share://', '/share/');
  const content = await fs.readFile(path, 'utf-8');
  return content;
}
