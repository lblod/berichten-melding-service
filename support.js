import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import {
  uuid,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';
import * as env from './env';
import * as jobsAndTasks from './jobAndTaskManagement';
import * as N3 from 'n3';
const { namedNode } = N3.DataFactory;

export async function isSubmitted(resource, submissionGraph) {
  const result = await query(`
      SELECT (COUNT(*) as ?count)
      WHERE {
        GRAPH ${sparqlEscapeUri(submissionGraph)} {
          ${sparqlEscapeUri(resource)} ?p ?o .
        }
      }
    `);
  return parseInt(result.results.bindings[0].count.value) > 0;
}

export function extractSubmissionUrl(store) {
  const submissionUrls = store.getSubjects(
    namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    namedNode('http://rdf.myexperiment.org/ontologies/base/Submission'),
  );
  return submissionUrls[0]?.value;
}

export function findSubmittedResource(store) {
  const submittedResources = store.getObjects(
    undefined,
    namedNode('http://purl.org/dc/terms/subject'),
  );
  return submittedResources[0]?.value;
}

export function extractLocationUrl(store) {
  const locations = store.getObjects(
    undefined,
    namedNode('http://www.w3.org/ns/prov#atLocation'),
  );
  return locations[0]?.value;
}

export function extractMeldingUri(store) {
  const submissionUris = store.getSubjects(
    undefined,
    namedNode('http://rdf.myexperiment.org/ontologies/base/Submission'),
  );
  return submissionUris[0]?.value;
}

/*
 * serializes to turtle; takes all ?p ?o from subject
 */
export async function storeToTurtle(store, subjects) {
  let quads = [];
  for(const subject of subjects) {
    quads = [ ...quads, ...store.getQuads(subject)];
  }
  const storeCopy = new N3.Store();
  storeCopy.addQuads(quads);
  const writer = new N3.Writer({ format: 'application/n-quads' });
  storeCopy.forEach((quad) => writer.addQuad(quad));
  const ttl = await new Promise((resolve, reject) => {
    writer.end((error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
  return ttl;
}

export async function cleanCredentials(authenticationConfigurationUri) {
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

/**
 * convert results of select query to an array of objects.
 * courtesy: Niels Vandekeybus & Felix
 * @method parseResult
 * @return {Array}
 */
export function parseResult(result) {
  if (!(result.results && result.results.bindings.length)) return [];

  const bindingKeys = result.head.vars;
  return result.results.bindings.map((row) => {
    const obj = {};
    bindingKeys.forEach((key) => {
      if (
        row[key] &&
        row[key].datatype == 'http://www.w3.org/2001/XMLSchema#integer' &&
        row[key].value
      ) {
        obj[key] = parseInt(row[key].value);
      } else if (
        row[key] &&
        row[key].datatype == 'http://www.w3.org/2001/XMLSchema#dateTime' &&
        row[key].value
      ) {
        obj[key] = new Date(row[key].value);
      } else obj[key] = row[key] ? row[key].value : undefined;
    });
    return obj;
  });
}

export async function verifyKeyAndOrganisation(vendor, key, organisation) {
  const result = await query(`
    ${env.PREFIXES}
    SELECT DISTINCT ?organisationID WHERE  {
      GRAPH <http://mu.semte.ch/graphs/automatic-submission> {
        ${sparqlEscapeUri(vendor)}
          a foaf:Agent;
          muAccount:key ${sparqlEscapeString(key)};
          muAccount:canActOnBehalfOf ${sparqlEscapeUri(organisation)}.
      }
      ${sparqlEscapeUri(organisation)}
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
  const id = uuid();
  const uri = `http://data.lblod.info/errors/${id}`;
  const referenceTriple = reference
    ? `${sparqlEscapeUri(uri)}
         dct:references ${sparqlEscapeUri(reference)} .`
    : '';
  const detailTriple = detail
    ? `${sparqlEscapeUri(uri)}
         oslc:largePreview ${sparqlEscapeString(detail)} .`
    : '';
  const q = `
    PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
    PREFIX oslc: <http://open-services.net/ns/core#>
    PREFIX dct:  <http://purl.org/dc/terms/>
    PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>

    INSERT DATA {
      GRAPH <http://mu.semte.ch/graphs/error> {
        ${sparqlEscapeUri(uri)}
          a oslc:Error ;
          mu:uuid ${sparqlEscapeString(id)} ;
          dct:subject ${sparqlEscapeString('Automatic Submission Service')} ;
          oslc:message ${sparqlEscapeString(message)} ;
          dct:created ${sparqlEscapeDateTime(new Date().toISOString())} ;
          dct:creator ${sparqlEscapeUri(env.CREATOR)} .
        ${referenceTriple}
        ${detailTriple}
      }
    }`;
  try {
    await update(q);
    return uri;
  } catch (e) {
    console.warn(
      `[WARN] Something went wrong while trying to store an error.\nMessage: ${e}\nQuery: ${q}`,
    );
  }
}
