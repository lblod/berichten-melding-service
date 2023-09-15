import * as mas from '@lblod/mu-auth-sudo';
import * as mu from 'mu';
import * as env from './env';
////import * as jobsAndTasks from './jobAndTaskManagement';
//import * as N3 from 'n3';
//const { namedNode } = N3.DataFactory;

export async function exists(resource, orgGraph) {
  const result = await mas.querySudo(`
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

      SELECT (COUNT(*) as ?count)
      WHERE {
        GRAPH ${mu.sparqlEscapeUri(orgGraph)} {
          ${mu.sparqlEscapeUri(resource)} a ?type .
        }
      }
    `);
  return parseInt(result.results.bindings[0].count.value) > 0;
}

//TODO
//  check conversation: (we know it exists) correct organisation? Anything else?
//  Store "Notification" with auth, organisation, vendor, ...
//  Store remote object with auth
//
//  In separate section after download
//    Parse contents
//    Store contents (= message)
//    Find attachments and store remote objects for all of them with auth from "Notification"
//
//  Do anything after all download success?
export async function storeSubmission(
  { conversation, message, href },
  orgGraph,
  authenticationConfiguration,
) {
  let newAuthConf = {};
  try {
    const timestampSparql = mu.sparqlEscapeDateTime(new Date());
    const remoteDataId = mu.uuid();
    const remoteDataUri = `http://data.lblod.info/id/remote-data-objects/${remoteDataId}`;

    // We need to attach a cloned version of the authentication data, because:
    // 1. donwloadUrl will delete credentials after final state
    // 2. in a later phase, when attachments are fetched, these need to be reused.
    // -> If not cloned, the credentials might not be availible for the download of the attachments
    // Alternative: not delete the credentials after download, but the not always clear when exaclty query may be deleted.
    // E.g. after import-submission we're quite sure. But what if something goes wrong before that, or a download just takes longer.
    // The highly aync process makes it complicated
    // Note: probably some clean up background job might be needed. Needs perhaps a bit of better thinking
    newAuthConf = await attachClonedAuthenticationConfiguraton(
      remoteDataUri,
      orgGraph,
    );

    await mas.updateSudo(`
      ${env.PREFIXES}
      INSERT DATA {
        GRAPH ${mu.sparqlEscapeUri(orgGraph)} {
          ${mu.sparqlEscapeUri(remoteDataUri)}
            a nfo:RemoteDataObject,
              nfo:FileDataObject;
            rpioHttp:requestHeader
              <http://data.lblod.info/request-headers/accept/text/html>;
            mu:uuid ${mu.sparqlEscapeString(remoteDataId)};
            nie:url ${mu.sparqlEscapeUri(href)};
            dct:creator ${mu.sparqlEscapeUri(env.CREATOR)};
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
        GRAPH ${mu.sparqlEscapeUri(orgGraph)} {
          ${mu.sparqlEscapeUri(message)}
            nie:hasPart ${mu.sparqlEscapeUri(remoteDataUri)}.
        }
      }`);

    //update created-at/modified-at for submission
    await mas.updateSudo(`
      ${env.PREFIXES}
      INSERT DATA {
        GRAPH ${mu.sparqlEscapeUri(orgGraph)} {
          ${mu.sparqlEscapeUri(extractSubmissionUrl(store))}
            dct:created  ${timestampSparql};
            dct:modified ${timestampSparql}.
        }
      }
    `);

    return { message };
  } catch (e) {
    console.error(
      `Something went wrong during the storage of message ${message}.`,
    );
    console.error(e.message);
    console.info('Cleaning credentials');
    await sendErrorAlert({
      message: `Something went wrong during the storage of message ${message}.`,
      detail: e.message,
    });
    e.alreadyStoredError = true;
    if (authenticationConfiguration)
      await cleanCredentials(authenticationConfiguration);
    if (newAuthConf?.newAuthConf) {
      await cleanCredentials(newAuthConf.newAuthConf);
    }
    throw e;
  }
}

//async function storeToTurtle(store) {
//  const vendors = store.getObjects(
//    undefined,
//    namedNode('http://purl.org/pav/providedBy'),
//  );
//  const vendor = vendors[0];
//  const storeCopy = new N3.Store();
//  storeCopy.addQuads([...store]);
//  const toRemove = storeCopy.getQuads(vendor);
//  storeCopy.removeQuads(toRemove);
//  const writer = new N3.Writer({ format: 'application/n-quads' });
//  storeCopy.forEach((quad) => writer.addQuad(quad));
//  const ttl = await new Promise((resolve, reject) => {
//    writer.end((error, result) => {
//      if (error) reject(error);
//      else resolve(result);
//    });
//  });
//  return ttl;
//}

//async function attachClonedAuthenticationConfiguraton(
//  remoteDataObjectUri,
//  submissionUri,
//  orgGraph,
//) {
//  const getInfoQuery = `
//    ${env.PREFIXES}
//    SELECT DISTINCT ?graph ?secType ?authenticationConfiguration WHERE {
//      GRAPH ${sparqlEscapeUri(orgGraph)} {
//        ${sparqlEscapeUri(submissionUri)}
//          dgftSec:targetAuthenticationConfiguration
//            ?authenticationConfiguration.
//        ?authenticationConfiguration
//          dgftSec:securityConfiguration/rdf:type ?secType .
//      }
//    }
//  `;
//
//  const authData = parseResult(await query(getInfoQuery))[0];
//  const newAuthConf = `http://data.lblod.info/authentications/${uuid()}`;
//  const newConf = `http://data.lblod.info/configurations/${uuid()}`;
//  const newCreds = `http://data.lblod.info/credentials/${uuid()}`;
//
//  let cloneQuery = '';
//
//  if (!authData) {
//    return;
//  } else if (authData.secType === env.BASIC_AUTH) {
//    cloneQuery = `
//      ${env.PREFIXES}
//      INSERT {
//        GRAPH ${sparqlEscapeUri(orgGraph)} {
//          ${sparqlEscapeUri(remoteDataObjectUri)}
//            dgftSec:targetAuthenticationConfiguration
//              ${sparqlEscapeUri(newAuthConf)} .
//          ${sparqlEscapeUri(newAuthConf)}
//            dgftSec:secrets ${sparqlEscapeUri(newCreds)} .
//          ${sparqlEscapeUri(newCreds)} meb:username ?user ;
//            muAccount:password ?pass .
//          ${sparqlEscapeUri(newAuthConf)}
//            dgftSec:securityConfiguration ${sparqlEscapeUri(newConf)} .
//          ${sparqlEscapeUri(newConf)}
//            ?srcConfP ?srcConfO .
//        }
//      }
//      WHERE {
//        GRAPH ${sparqlEscapeUri(orgGraph)} {
//          ${sparqlEscapeUri(authData.authenticationConfiguration)}
//            dgftSec:securityConfiguration ?srcConfg.
//          ?srcConfg ?srcConfP ?srcConfO.
//
//          ${sparqlEscapeUri(authData.authenticationConfiguration)}
//            dgftSec:secrets ?srcSecrets.
//          ?srcSecrets  meb:username ?user ;
//            muAccount:password ?pass .
//        }
//     }`;
//  } else if (authData.secType == env.OAUTH2) {
//    cloneQuery = `
//      ${env.PREFIXES}
//      INSERT {
//        GRAPH ${sparqlEscapeUri(orgGraph)} {
//          ${sparqlEscapeUri(remoteDataObjectUri)}
//            dgftSec:targetAuthenticationConfiguration
//              ${sparqlEscapeUri(newAuthConf)} .
//          ${sparqlEscapeUri(newAuthConf)}
//            dgftSec:secrets
//              ${sparqlEscapeUri(newCreds)} .
//          ${sparqlEscapeUri(newCreds)} dgftOauth:clientId ?clientId ;
//            dgftOauth:clientSecret ?clientSecret .
//          ${sparqlEscapeUri(newAuthConf)}
//            dgftSec:securityConfiguration ${sparqlEscapeUri(newConf)} .
//          ${sparqlEscapeUri(newConf)}
//            ?srcConfP ?srcConfO .
//        }
//      }
//      WHERE {
//        GRAPH ${sparqlEscapeUri(orgGraph)} {
//          ${sparqlEscapeUri(authData.authenticationConfiguration)}
//            dgftSec:securityConfiguration ?srcConfg.
//          ?srcConfg ?srcConfP ?srcConfO.
//
//          ${sparqlEscapeUri(authData.authenticationConfiguration)}
//            dgftSec:secrets ?srcSecrets.
//          ?srcSecrets  dgftOauth:clientId ?clientId ;
//            dgftOauth:clientSecret ?clientSecret .
//        }
//     }`;
//  } else {
//    throw `Unsupported Security type ${authData.secType}`;
//  }
//
//  await update(cloneQuery);
//
//  return { newAuthConf, newConf, newCreds };
//}

async function cleanCredentials(authenticationConfigurationUri) {
  let cleanQuery = `
    ${env.PREFIXES}
    DELETE {
      GRAPH ?g {
        ?srcSecrets ?secretsP ?secretsO.
      }
    }
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(authenticationConfigurationUri)}
          dgftSec:secrets ?srcSecrets.
        ?srcSecrets
          ?secretsP ?secretsO.
     }
   }`;
  await update(cleanQuery);
}

export async function verifyKeyAndOrganisation(vendor, key, organisation) {
  const result = await mas.querySudo(`
    ${env.PREFIXES}
    SELECT DISTINCT ?organisationID WHERE  {
      GRAPH <http://mu.semte.ch/graphs/automatic-submission> {
        ${mu.sparqlEscapeUri(vendor)}
          a foaf:Agent;
          muAccount:key ${mu.sparqlEscapeString(key)};
          muAccount:canActOnBehalfOf ${mu.sparqlEscapeUri(organisation)}.
      }
      ${mu.sparqlEscapeUri(organisation)}
        mu:uuid ?organisationID.
    }`);
  if (result.results.bindings.length === 1) {
    return result.results.bindings[0].organisationID.value;
  }
}

export function cleanseRequestBody(body) {
  const cleansed = body;
  if (cleansed?.authentication) delete cleansed.authentication;
  if (cleansed?.publisher?.key) delete cleansed.publisher.key;
  return cleansed;
}

export async function sendErrorAlert({ message, detail, reference }) {
  if (!message) throw 'Error needs a message describing what went wrong.';
  const id = mu.uuid();
  const uri = `http://data.lblod.info/errors/${id}`;
  const referenceTriple = reference
    ? `${mu.sparqlEscapeUri(uri)}
         dct:references ${mu.sparqlEscapeUri(reference)} .`
    : '';
  const detailTriple = detail
    ? `${mu.sparqlEscapeUri(uri)}
         oslc:largePreview ${mu.sparqlEscapeString(detail)} .`
    : '';
  const q = `
    PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
    PREFIX oslc: <http://open-services.net/ns/core#>      
    PREFIX dct:  <http://purl.org/dc/terms/>
    PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
    
    INSERT DATA {
      GRAPH <http://mu.semte.ch/graphs/error> {
        ${mu.sparqlEscapeUri(uri)}
          a oslc:Error ;
          mu:uuid ${mu.sparqlEscapeString(id)} ;
          dct:subject ${mu.sparqlEscapeString('Automatic Submission Service')} ;
          oslc:message ${mu.sparqlEscapeString(message)} ;
          dct:created ${mu.sparqlEscapeDateTime(new Date().toISOString())} ;
          dct:creator ${mu.sparqlEscapeUri(env.CREATOR)} .
        ${referenceTriple}
        ${detailTriple}
      }
    }`;
  try {
    await mas.updateSudo(q);
    return uri;
  } catch (e) {
    console.warn(
      `[WARN] Something went wrong while trying to store an error.\nMessage: ${e}\nQuery: ${q}`,
    );
  }
}
