import * as env from './env';
import { updateSudo as update } from '@lblod/mu-auth-sudo';
import {
  uuid,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeUri,
} from 'mu';

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
