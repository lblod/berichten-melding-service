import { sparqlEscapeUri } from 'mu';
import { querySudo as query } from '@lblod/mu-auth-sudo';
import * as env from '../env';
import { parseResult } from '../support';
import { updateTaskOndownloadEvent  as updateRegisterTaskOnDownloadEvent } from './register-task';
import { startTask as startImportTask } from './import-task';
import { updateTaskOndownloadEvent as updateImportTaskOnDownloadEvent } from './import-task';

/*
 * Main entry point for processing deltas
 */
export async function dispatchOnDelta(req) {
  const remoteDataInfo = getRemoteDataObjectInfoDelta(req);
  if(remoteDataInfo.length) {
    await processOnDownloadEvent(remoteDataInfo);
  }
  const taskDataInfo = getTaskInfoDelta(req);
  if(taskDataInfo.length) {
    await processOnTaskUpdateEvent(taskDataInfo);
  }
}

async function processOnDownloadEvent(remoteDataInfo) {
  for (const remoteDataObjectTriple of remoteDataInfo) {
    const downloadStatus = remoteDataObjectTriple.object.value;
    const result = await getTaskInfoFromRemoteDataObject(
      remoteDataObjectTriple.subject.value
    );
    if(result) {
      const { job, task, taskStatus, operation, collection } = result;

      if(taskStatus !== env.TASK_STATUSES.busy) {
        // Many possible causes for this state, e.g multiple graphs, issue with docker network etc.
        console.warn(`The associated task status is already in a final state, probably a too eager delta-notification`);
        return;
      }
      if(operation == 'http://lblod.data.gift/id/jobs/concept/TaskOperation/register-bericht') {
        await updateRegisterTaskOnDownloadEvent(job, task, downloadStatus);
      }
      else if(operation == 'http://lblod.data.gift/id/jobs/concept/TaskOperation/import-bericht') {
        await updateImportTaskOnDownloadEvent(job,
                                              task,
                                              downloadStatus,
                                              remoteDataObjectTriple.subject.value,
                                              collection
                                             );
      }
    }
  }
}

async function processOnTaskUpdateEvent(taskDeltaData) {
  for(const data of taskDeltaData) {

    const taskInfo = await getTaskInfo(data.subject.value);
    if(taskInfo) {
      // We ensure we don't work with obsolete state
      if(taskInfo.taskStatus !== env.TASK_STATUSES.scheduled) {
        console.warn(`The associated task status is already in a not scheduled state, probably a too eager delta-notification`);
        return;
      }
      if(taskInfo.operation == 'http://lblod.data.gift/id/jobs/concept/TaskOperation/import-bericht') {
        await startImportTask({
          jobUri: taskInfo.job,
          taskUri: taskInfo.task
        });
      }
    }
  }
}

function getRemoteDataObjectInfoDelta (req) {
  const data = req.body
        .map(changeset => changeset.inserts)
        .filter(inserts => inserts.length > 0)
        .flat()
        .filter(insert => insert.predicate.value === env.ADMS_STATUS_PREDICATE)
        .filter(insert =>
            insert.object.value === env.DOWNLOAD_STATUSES.success ||
            insert.object.value === env.DOWNLOAD_STATUSES.failure,
        );
  return data;
}

function getTaskInfoDelta (req) {
  const data = req.body
        .map(changeset => changeset.inserts)
        .filter(inserts => inserts.length > 0)
        .flat()
        .filter(insert => insert.predicate.value === env.ADMS_STATUS_PREDICATE)
        .filter(insert =>
          insert.object.value === env.TASK_STATUSES.scheduled
        );
  return data;
}

async function getTaskInfoFromRemoteDataObject(remoteDataObjectUri) {
  const remoteDataObjectUriSparql = sparqlEscapeUri(remoteDataObjectUri);
  const taskQuery = `
    ${env.PREFIXES}
    SELECT DISTINCT ?task ?taskStatus ?job ?operation ?collection WHERE {
      ?collection dct:hasPart ${remoteDataObjectUriSparql}.
      ?container task:hasHarvestingCollection ?collection.
      ?task a task:Task;
         adms:status ?taskStatus;
         task:inputContainer ?container;
         task:operation ?operation;
         dct:isPartOf ?job.
    }
    LIMIT 1`;

  const response = await query(taskQuery);
  return parseResult(response)[0];
}

async function getTaskInfo(taskUri) {
  const taskUriSparql = sparqlEscapeUri(taskUri);
  const taskQuery = `
    ${env.PREFIXES}
    SELECT DISTINCT ?task ?taskStatus ?job ?operation WHERE {
      VALUES ?task {
        ${taskUriSparql}
      }
      ?task a task:Task;
         adms:status ?taskStatus;
         task:operation ?operation;
         dct:isPartOf ?job.
    }
    LIMIT 1`;

  const response = await query(taskQuery);
  return parseResult(response)[0];
}
