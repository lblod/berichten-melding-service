import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import * as env from '../env';

import {
  uuid,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';

import {
  storeToTurtle,
  parseResult,
  sendErrorAlert,
  cleanCredentials
} from '../support';

import * as jobsAndTasks from '../jobAndTaskManagement';

import {
  extractInfoFromTriplesForRegister
} from '../jsonld-input';

export async function scheduleJob(store,
                                  {
                                    href,
                                    submittedResource,
                                    authenticationConfiguration,
                                    secret,
                                    securityConfig,
                                    submissionGraph
                                 }) {
  let newAuthConf = {};
  let submissionTaskUri = '';

  const jobUuid = uuid();
  const jobUri = `http://data.lblod.info/id/task/${jobUuid}`;

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
            dct:creator services:berichten-melding-service ;
            adms:status js:busy ;
            dct:created ${nowSparql} ;
            dct:modified ${nowSparql} ;
            task:operation ${sparqlEscapeUri(env.OPERATIONS.harvestBericht)};
            dgftSec:targetAuthenticationConfiguration ${sparqlEscapeUri(authenticationConfiguration)}.
        }
      }`;

    await update(createJobQueryString);

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
            task:operation tasko:register ;
            dct:creator ${sparqlEscapeUri(env.CREATOR)} ;
            task:index "0" ;
            dct:isPartOf ${sparqlEscapeUri(jobUri)} .
        }
      }
    `;

    await update(submissionTaskQuery);

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
          dgftSec:securityConfiguration ${sparqlEscapeUri(authenticationConfiguration)}.

       asj:${submissionTaskUuid} task:inputContainer ${sparqlEscapeUri(containerUri)}.
     }
    }
    `;

    await update(containerTaskQuery);

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

    await update(collectionQuery);

    const timestampSparql = sparqlEscapeDateTime(new Date());
    const remoteDataId = uuid();
    const remoteDataUri = `http://data.lblod.info/id/remote-data-objects/${remoteDataId}`;

    // We need to attach a cloned version of the authentication data, because:
    // 1. downloadUrl will delete credentials after final state
    // 2. in a later phase, when attachments are fetched, these need to be reused.
    // -> If not cloned, the credentials might not be availible for the download of the attachments
    // Alternative: not delete the credentials after download, but the not always clear when exaclty query may be deleted.
    // E.g. after import-submission we're quite sure. But what if something goes wrong before that, or a download just takes longer.
    // The highly aync process makes it complicated
    // Note: probably some clean up background job might be needed. Needs perhaps a bit of better thinking
    newAuthConf = await attachClonedAuthenticationConfiguraton(
      remoteDataUri,
      jobUri,
      submissionGraph,
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
    const generalMessage = `Something went wrong during the storage of submission ${submittedResource}. This is monitored via job ${jobUri}.`;
    console.error(generalMessage);
    console.error(e.message);
    console.info('Cleaning credentials');
    const errorUri = await sendErrorAlert({
      message: generalMessage,
      detail: e.message,
    });
    await jobsAndTasks.failTask(
      submissionGraph,
      submissionTaskUri,
      jobUri,
      errorUri,
    );
    e.alreadyStoredError = true;
    if (authenticationConfiguration)
      await cleanCredentials(authenticationConfiguration);
    if (newAuthConf?.newAuthConf) {
      await cleanCredentials(newAuthConf.newAuthConf);
    }
    throw e;
  }
}

async function attachClonedAuthenticationConfiguraton(
  remoteDataObjectUri,
  jobUri,
  submissionGraph,
) {
  const getInfoQuery = `
    ${env.PREFIXES}
    SELECT DISTINCT ?graph ?secType ?authenticationConfiguration WHERE {
      GRAPH ${sparqlEscapeUri(submissionGraph)} {
        ${sparqlEscapeUri(jobUri)}
          dgftSec:targetAuthenticationConfiguration
            ?authenticationConfiguration.
        ?authenticationConfiguration
          dgftSec:securityConfiguration/rdf:type ?secType .
      }
    }
  `;

  const authData = parseResult(await query(getInfoQuery))[0];
  const newAuthConf = `http://data.lblod.info/authentications/${uuid()}`;
  const newConf = `http://data.lblod.info/configurations/${uuid()}`;
  const newCreds = `http://data.lblod.info/credentials/${uuid()}`;

  let cloneQuery = '';

  if (!authData) {
    return undefined;
  } else if (authData.secType === env.BASIC_AUTH) {
    cloneQuery = `
      ${env.PREFIXES}
      INSERT {
        GRAPH ${sparqlEscapeUri(submissionGraph)} {
          ${sparqlEscapeUri(remoteDataObjectUri)}
            dgftSec:targetAuthenticationConfiguration
              ${sparqlEscapeUri(newAuthConf)} .
          ${sparqlEscapeUri(newAuthConf)}
            dgftSec:secrets ${sparqlEscapeUri(newCreds)} .
          ${sparqlEscapeUri(newCreds)} meb:username ?user ;
            muAccount:password ?pass .
          ${sparqlEscapeUri(newAuthConf)}
            dgftSec:securityConfiguration ${sparqlEscapeUri(newConf)} .
          ${sparqlEscapeUri(newConf)}
            ?srcConfP ?srcConfO .
        }
      }
      WHERE {
        GRAPH ${sparqlEscapeUri(submissionGraph)} {
          ${sparqlEscapeUri(authData.authenticationConfiguration)}
            dgftSec:securityConfiguration ?srcConfg.
          ?srcConfg ?srcConfP ?srcConfO.

          ${sparqlEscapeUri(authData.authenticationConfiguration)}
            dgftSec:secrets ?srcSecrets.
          ?srcSecrets  meb:username ?user ;
            muAccount:password ?pass .
        }
     }`;
  } else if (authData.secType == env.OAUTH2) {
    cloneQuery = `
      ${env.PREFIXES}
      INSERT {
        GRAPH ${sparqlEscapeUri(submissionGraph)} {
          ${sparqlEscapeUri(remoteDataObjectUri)}
            dgftSec:targetAuthenticationConfiguration
              ${sparqlEscapeUri(newAuthConf)} .
          ${sparqlEscapeUri(newAuthConf)}
            dgftSec:secrets
              ${sparqlEscapeUri(newCreds)} .
          ${sparqlEscapeUri(newCreds)} dgftOauth:clientId ?clientId ;
            dgftOauth:clientSecret ?clientSecret .
          ${sparqlEscapeUri(newAuthConf)}
            dgftSec:securityConfiguration ${sparqlEscapeUri(newConf)} .
          ${sparqlEscapeUri(newConf)}
            ?srcConfP ?srcConfO .
        }
      }
      WHERE {
        GRAPH ${sparqlEscapeUri(submissionGraph)} {
          ${sparqlEscapeUri(authData.authenticationConfiguration)}
            dgftSec:securityConfiguration ?srcConfg.
          ?srcConfg ?srcConfP ?srcConfO.

          ${sparqlEscapeUri(authData.authenticationConfiguration)}
            dgftSec:secrets ?srcSecrets.
          ?srcSecrets  dgftOauth:clientId ?clientId ;
            dgftOauth:clientSecret ?clientSecret .
        }
     }`;
  }
  else {
    throw `Unsupported Security type ${authData.secType}`;
  }

  await update(cloneQuery);

  return { newAuthConf, newConf, newCreds };

}
