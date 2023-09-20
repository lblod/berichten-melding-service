import * as env from './env';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import {
  uuid,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';
import { parseResult } from './support';


export async function downloadTaskCreate(
  submissionGraph,
  jobUri,
  remoteDataObjectUri,
) {
  const nowSparql = sparqlEscapeDateTime(new Date().toISOString());
  const downloadTaskUuid = uuid();
  const inputContainerUuid = uuid();
  const harvestingCollectionUuid = uuid();
  const downloadTaskQuery = `
    ${env.PREFIXES}
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        asj:${downloadTaskUuid}
          a task:Task ;
          mu:uuid ${sparqlEscapeString(downloadTaskUuid)} ;
          adms:status js:scheduled ;
          dct:created ${nowSparql} ;
          dct:modified ${nowSparql} ;
          task:cogsOperation cogs:WebServiceLookup ;
          task:operation tasko:download ;
          dct:creator services:automatic-submission-service ;
          task:index "1" ;
          dct:isPartOf ${sparqlEscapeUri(jobUri)} ;
          task:inputContainer asj:${inputContainerUuid} .

        asj:${inputContainerUuid}
          a nfo:DataContainer ;
          mu:uuid ${sparqlEscapeString(inputContainerUuid)} ;
          task:hasHarvestingCollection asj:${harvestingCollectionUuid} .

        asj:${harvestingCollectionUuid}
          a hrvst:HarvestingCollection ;
          dct:creator services:automatic-submission-service ;
          dct:hasPart ${sparqlEscapeUri(remoteDataObjectUri)} .
      }
    }
  `;
  await update(downloadTaskQuery);

  const downloadTaskUri = env.JOB_PREFIX.concat(downloadTaskUuid);
  return downloadTaskUri;
}

async function downloadStarted(submissionGraph, downloadTaskUri) {
  const nowSparql = sparqlEscapeDateTime(new Date().toISOString());
  const downloadTaskUriSparql = sparqlEscapeUri(downloadTaskUri);
  const downloadTaskQuery = `
    ${env.PREFIXES}
    DELETE {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${downloadTaskUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
    INSERT {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${downloadTaskUriSparql}
          adms:status js:busy ;
          dct:modified ${nowSparql} .
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${downloadTaskUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
  `;
  await update(downloadTaskQuery);
}

async function downloadSuccess(
  submissionGraph,
  downloadTaskUri,
  logicalFileUri,
) {
  const nowSparql = sparqlEscapeDateTime(new Date().toISOString());
  const resultContainerUuid = uuid();
  const downloadTaskUriSparql = sparqlEscapeUri(downloadTaskUri);
  const downloadTaskQuery = `
    ${env.PREFIXES}
    DELETE {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${downloadTaskUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
    INSERT {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${downloadTaskUriSparql}
          adms:status js:success ;
          dct:modified ${nowSparql} ;
          task:resultsContainer asj:${resultContainerUuid} .

        asj:${resultContainerUuid}
          a nfo:DataContainer ;
          mu:uuid ${sparqlEscapeString(resultContainerUuid)} ;
          task:hasFile ${sparqlEscapeUri(logicalFileUri)} .
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${downloadTaskUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
  `;
  await update(downloadTaskQuery);
}

async function downloadFail(
  submissionGraph,
  downloadTaskUri,
  jobUri,
  logicalFileUri,
  errorMsg,
) {
  const nowSparql = sparqlEscapeDateTime(new Date().toISOString());
  const downloadTaskUriSparql = sparqlEscapeUri(downloadTaskUri);
  const resultContainerUuid = uuid();
  const errorUuid = uuid();
  const fileTriples = logicalFileUri
    ? `
      asj:${resultContainerUuid}
        a nfo:DataContainer ;
        mu:uuid ${sparqlEscapeString(resultContainerUuid)} ;
        task:hasFile ${sparqlEscapeUri(logicalFileUri)} .`
    : '';
  const errorTriples = errorMsg
    ? `
      asj:${errorUuid}
        a oslc:Error ;
        oslc:message ${sparqlEscapeString(errorMsg)} .`
    : '';
  const linkResultContainerTriplePart = logicalFileUri
    ? `task:resultsContainer asj:${resultContainerUuid} ;`
    : '';
  const downloadTaskQuery = `
    ${env.PREFIXES}
    DELETE {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${downloadTaskUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
    INSERT {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${downloadTaskUriSparql}
          adms:status js:failed ;
          ${errorMsg ? `task:error asj:${errorUuid} ;` : ''}
          ${linkResultContainerTriplePart}
          dct:modified ${nowSparql} .
        ${fileTriples}
        ${errorTriples}
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${downloadTaskUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
  `;
  await update(downloadTaskQuery);

  //Also set the job to failure
  const jobUriSparql = sparqlEscapeUri(jobUri);
  const assJobQuery = `
    ${env.PREFIXES}
    DELETE {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${jobUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
    INSERT {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${jobUriSparql}
          adms:status js:failed ;
          ${errorMsg ? `task:error asj:${errorUuid} ;` : ''}
          dct:modified ${nowSparql} ;
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${jobUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
  `;
  await update(assJobQuery);
}
