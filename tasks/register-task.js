import { updateSudo as update } from '@lblod/mu-auth-sudo';
import * as env from '../env';
import {
  attachClonedAuthenticationConfiguraton,
  getAuthticationConfigurationForJob
       } from '../lib/download-file-helpers';

import {
  uuid,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';

import {
  updateStatus,
  storeToTurtle,
  cleanCredentials
} from '../support';

/*
 * Main entry point to schedule the registration job
 */
export async function scheduleJob(store,
                                  {
                                    href,
                                    submittedResource,
                                    authenticationConfiguration,
                                    secret,
                                    securityConfig,
                                    submissionGraph,
                                    organisation,
                                    vendor
                                 }) {
  let newAuthConf = {};
  let submissionTaskUri = '';

  const jobUuid = uuid();
  const jobUri = `http://data.lblod.info/id/job/${jobUuid}`;

  try {

    let nowSparql = sparqlEscapeDateTime(new Date().toISOString());

    const subjects = [
      authenticationConfiguration,
      secret,
      securityConfig,
                     ];
    const turtle = await storeToTurtle(store, subjects);

    // Schedule the job by bundling data received through the API
    // It bundles a lump of data, due to incoming info from the API
    const createJobQueryString = `
      ${env.PREFIXES}
      INSERT DATA {
        GRAPH ${sparqlEscapeUri(submissionGraph)} {
           ${turtle}
          ${sparqlEscapeUri(jobUri)}
            a cogs:Job ;
            mu:uuid ${sparqlEscapeString(jobUuid)} ;
            dct:subject ${sparqlEscapeUri(submittedResource)};
            dct:creator services:berichten-melding-service ;
            adms:status js:busy ;
            dct:created ${nowSparql} ;
            dct:modified ${nowSparql} ;
            task:operation ${sparqlEscapeUri(env.OPERATIONS.harvestBericht)};
            dgftSec:targetAuthenticationConfiguration ${sparqlEscapeUri(authenticationConfiguration)}.
        }
      }`;

    // task
    nowSparql = sparqlEscapeDateTime(new Date().toISOString());
    const submissionTaskUuid = uuid();
    submissionTaskUri = `http://data.lblod.info/id/task/${submissionTaskUuid}`;
    const submissionTaskQuery = `
      ${env.PREFIXES}
      INSERT DATA {
        GRAPH ${sparqlEscapeUri(submissionGraph)} {
          ${sparqlEscapeUri(submissionTaskUri)}
            a task:Task ;
            mu:uuid ${sparqlEscapeString(submissionTaskUuid)} ;
            adms:status js:busy ;
            dct:created ${nowSparql} ;
            dct:modified ${nowSparql} ;
            task:operation tasko:register-bericht ;
            dct:creator ${sparqlEscapeUri(env.CREATOR)} ;
            task:index "0" ;
            dct:isPartOf ${sparqlEscapeUri(jobUri)} .
        }
      }
    `;

    // container
    const containerUuid = uuid();
    const containerUri = `http://data.lblod.info/id/container/${containerUuid}`;
    const containerTaskQuery = `
    ${env.PREFIXES}
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${sparqlEscapeUri(containerUri)}
          a nfo:DataContainer ;
          mu:uuid ${sparqlEscapeString(containerUuid)} ;
          dct:subject ${sparqlEscapeUri(submittedResource)};
          schema:sender ${sparqlEscapeUri(organisation)};
          pav:providedBy ${sparqlEscapeUri(vendor)}.

        ${sparqlEscapeUri(submissionTaskUri)} task:inputContainer ${sparqlEscapeUri(containerUri)}.
     }
    }
    `;

    //harvesting collection
    const collectionUuid = uuid();
    const collectionUri = `http://data.lblod.info/id/harvest-collection/${collectionUuid}`;
    const collectionQuery = `
    ${env.PREFIXES}
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${sparqlEscapeUri(collectionUri)}
          a  hrvst:HarvestingCollection ;
          mu:uuid ${sparqlEscapeString(collectionUuid)}.

       ${sparqlEscapeUri(containerUri)} task:hasHarvestingCollection ${sparqlEscapeUri(collectionUri)}.
     }
    }
    `;

    // We bundle the calls, in reverse order, here
    // The JobCreation query 'signals' to other services (in casu the vendor-data-distribution)
    // that sufficient information is ready to act on it
    await update(collectionQuery);
    await update(containerTaskQuery);
    await update(submissionTaskQuery);
    await update(createJobQueryString);

    const timestampSparql = sparqlEscapeDateTime(new Date());
    const remoteDataId = uuid();
    const remoteDataUri = `http://data.lblod.info/id/remote-data-objects/${remoteDataId}`;

    //See documention of function for reasoning
    newAuthConf = await attachClonedAuthenticationConfiguraton(
      remoteDataUri,
      jobUri
    );

    const remoteDataObjectQuery = `
      ${env.PREFIXES}
      INSERT DATA {
        GRAPH ${sparqlEscapeUri(submissionGraph)} {
          ${sparqlEscapeUri(remoteDataUri)}
            a nfo:RemoteDataObject,
              nfo:FileDataObject;
            rpioHttp:requestHeader
              <http://data.lblod.info/request-headers/accept/text/html>;
            mu:uuid ${sparqlEscapeString(remoteDataId)};
            nie:url ${sparqlEscapeUri(href)};
            dct:creator ${sparqlEscapeUri(env.CREATOR)};
            adms:status
              <http://lblod.data.gift/file-download-statuses/ready-to-be-cached>;
            dct:created ${timestampSparql};
            dct:modified ${timestampSparql}.

         <http://data.lblod.info/request-headers/accept/text/html>
          a http:RequestHeader;
          http:fieldValue "text/html";
          http:fieldName "Accept";
          http:hdrName <http://www.w3.org/2011/http-headers#accept>.
        }
        GRAPH ${sparqlEscapeUri(submissionGraph)} {
          ${sparqlEscapeUri(collectionUri)} dct:hasPart ${sparqlEscapeUri(remoteDataUri)}.
        }
      }
    `;

    await update(remoteDataObjectQuery);


    return { submittedResource, jobUri };
  }
  catch (e) {
    await updateStatus(submissionTaskUri, env.TASK_STATUSES.failed);
    if (authenticationConfiguration)
      await cleanCredentials(authenticationConfiguration);
    if (newAuthConf?.newAuthConf) {
      await cleanCredentials(newAuthConf.newAuthConf);
    }
    e.job = jobUri;
    throw e;
  }
}

export async function updateTaskOndownloadEvent(job, task, downloadStatus) {
  try {
    if(downloadStatus == env.DOWNLOAD_STATUSES.failure) {
      const errorMessage = `Failed to download source HTML for ${job}`;
      throw new Error(errorMessage);
    }
    else if(downloadStatus == env.DOWNLOAD_STATUSES.success) {
      const updateResultsContainer = `
        ${env.PREFIXES}
        INSERT {
          GRAPH ?g {
            ?task task:resultsContainer ?resultsContainer.
          }
        }
        WHERE {
          GRAPH ?g {
            VALUES ?task {
              ${sparqlEscapeUri(task)}
            }
            ?task a task:Task;
               task:inputContainer ?resultsContainer.
          }
        }
      `;
      await update(updateResultsContainer);
      await updateStatus(task, env.TASK_STATUSES.success);
    }
  }
  catch (e) {
    const authconfig = await getAuthticationConfigurationForJob(job);
    if(authconfig) {
      await cleanCredentials(authconfig);
    }
    await updateStatus(task, env.TASK_STATUSES.failed);
    e.job = job;
    throw e;
  }
}
