// import { PrismaClient } from "@prisma/client";

import { parse } from 'stacktrace-parser'
import path from 'path'
import { getPrismaClient } from '@prisma/client/runtime'
const { getDMMF } = require('@prisma/client/generator-build')
import { getEnginesPath } from '@prisma/engines'
import { getPlatform } from '@prisma/get-platform'
import {
  getRelativeSchemaPath,
  getConfig,
  extractPreviewFeatures,
  mapPreviewFeatures,
  printConfigWarnings,
  getEnvPaths,
  resolveBinary,
} from '@prisma/sdk'
import fs from 'fs'
const promisify = require('util.promisify')
const readFile = promisify(fs.readFile)

export function absolutizeRelativePath(
  url: string,
  cwd: string,
  outputDir: string,
  absolutePaths?: boolean,
): string {
  let filePath = url

  if (filePath.startsWith('file:')) {
    filePath = filePath.slice(5)
  }

  const absoluteTarget = path.resolve(cwd, filePath)

  if (absolutePaths) {
    return absoluteTarget
  }

  return `${path.relative(outputDir, absoluteTarget)}`
}

export function extractSqliteSources(
  datamodel: string,
  cwd: string,
  outputDir: string,
  absolutePaths?: boolean,
): any[] {
  const overrides: any[] = []
  const lines = datamodel.split('\n').filter((l) => !l.trim().startsWith('//'))
  const lineRegex = /\s*url\s+=\s*"(file:[^\/].*)"/
  const startRegex = /\s*datasource\s*(\w+)\s*{/

  lines.forEach((line, index) => {
    const match = lineRegex.exec(line)
    if (match) {
      // search for open tag
      let startLine
      let searchIndex = index - 1
      while (!startLine && searchIndex >= 0) {
        const currentLine = lines[searchIndex]
        const commentIndex = currentLine.indexOf('//')
        const curlyIndex = currentLine.indexOf('{')
        if (curlyIndex > -1) {
          if (commentIndex === -1) {
            startLine = currentLine
          }
          if (commentIndex > curlyIndex) {
            startLine = currentLine
          }
        }

        searchIndex--
      }

      if (!startLine) {
        throw new Error(
          `Could not parse datamodel, invalid datasource block without opening \`{\``,
        )
      }

      const startMatch = startRegex.exec(startLine)
      if (startMatch) {
        overrides.push({
          name: startMatch[1],
          url: absolutizeRelativePath(match[1], cwd, outputDir, absolutePaths),
        })
      } else {
        throw new Error(
          `Could not parse datamodel, line ${
            searchIndex + 1
          }: \`${startLine}\` is not parseable`,
        )
      }
    }
  })
  return overrides
}

async function getTestClient(
  schemaDir?: string,
  printWarnings?: boolean,
): Promise<any> {
  if (!schemaDir) {
    const callsite = parse(new Error('').stack!)
    schemaDir = path.dirname(callsite[1].file!)
  }
  const schemaPath = await getRelativeSchemaPath(schemaDir)
  const datamodel = await readFile(schemaPath!, 'utf-8')
  const config = await getConfig({ datamodel, ignoreEnvVarErrors: true })
  if (printWarnings) {
    printConfigWarnings(config.warnings)
  }

  const generator = config.generators.find(
    (g: any) => g.provider === 'prisma-client-js',
  )
  const enableExperimental = mapPreviewFeatures(extractPreviewFeatures(config))
  const platform = await getPlatform()
  const prismaPath = path.join(getEnginesPath(), `query-engine-${platform}`)
  console.log({ prismaPath })
  const document = await getDMMF({
    datamodel,
    enableExperimental,
    prismaPath,
  })
  const outputDir = schemaDir

  const relativeEnvPaths = getEnvPaths(schemaPath, { cwd: schemaDir })

  const options: any = {
    document,
    generator,
    dirname: schemaDir,
    relativePath: path.relative(outputDir, schemaDir),
    clientVersion: 'client-test-version',
    engineVersion: 'engine-test-version',
    relativeEnvPaths,
    datasourceNames: config.datasources.map((d: any) => d.name),
    sqliteDatasourceOverrides: extractSqliteSources(
      datamodel,
      schemaDir,
      outputDir,
    ),
    activeProvider: config.datasources[0].activeProvider,
  }

  return getPrismaClient(options)
}

// const prisma = new PrismaClient();
let prisma: any
// A `main` function so that you can use async/await
async function main() {
  // ... you will write your Prisma Client queries here

  const PrismaClient = await getTestClient(path.resolve('./prisma'))
  prisma = new PrismaClient()
  console.log(prisma)

  const updated = await prisma.user.update({
    where: {
      email: 'sarah@prisma.io',
    },
    data: {
      name: 'pp',
    },
  })
  console.log('updates', updated)

  const all = await prisma.user.findMany()
  console.log('all', all)
}

main()
  .catch((e) => {
    throw e
  })
  .finally(async () => {
    // await prisma.$disconnect();
  })
