/**
 * Test script for semantic search functionality
 * Run with: npx tsx test-semantic-search.ts
 */

import { semanticSearch } from './services/semanticSearch';
import { knowledgeService } from './services/knowledgeService';

async function testSemanticSearch() {
  console.log('=== Semantic Search Test Suite ===\n');

  // Get all documents
  const documents = await knowledgeService.getDocumentIndex();
  console.log(`Loaded ${documents.length} documents\n`);

  // Test queries
  const testQueries = [
    'insurance claims',
    'warranty information',
    'repair agreement',
    'email template',
    'license certification',
    'sales script',
    'training materials',
    'GAF warranty',
    'Maryland requirements',
    'adjuster meeting'
  ];

  console.log('Testing semantic search with various queries:\n');

  for (const query of testQueries) {
    console.log(`Query: "${query}"`);
    const startTime = performance.now();

    const results = await knowledgeService.searchDocuments(query, documents);

    const endTime = performance.now();
    const searchTime = endTime - startTime;

    console.log(`  ✓ Found ${results.length} results in ${searchTime.toFixed(2)}ms`);

    if (results.length > 0) {
      console.log(`  Top 3 results:`);
      results.slice(0, 3).forEach((result, idx) => {
        console.log(`    ${idx + 1}. ${result.document.name} (${(result.relevance * 100).toFixed(1)}% relevance)`);
        console.log(`       Category: ${result.document.category}`);
      });
    }
    console.log('');
  }

  // Test "Find Similar" feature
  console.log('\n=== Testing "Find Similar" Feature ===\n');

  // Pick a random document
  const randomDoc = documents[Math.floor(Math.random() * documents.length)];
  console.log(`Base document: "${randomDoc.name}" (${randomDoc.category})\n`);

  const similarDocs = await knowledgeService.findSimilarDocuments(randomDoc, documents);

  if (similarDocs.length > 0) {
    console.log(`Found ${similarDocs.length} similar documents:`);
    similarDocs.forEach((similar, idx) => {
      console.log(`  ${idx + 1}. ${similar.document.name} (${(similar.similarity * 100).toFixed(1)}% similar)`);
      console.log(`     Category: ${similar.document.category}`);
    });
  } else {
    console.log('No similar documents found.');
  }

  // Get search statistics
  console.log('\n=== Search Engine Statistics ===\n');
  const stats = knowledgeService.getSearchStats();
  console.log(`Total Documents: ${stats.totalDocuments}`);
  console.log(`Unique Terms: ${stats.totalUniqueTerms}`);
  console.log(`Avg Terms per Document: ${stats.averageTermsPerDocument.toFixed(2)}`);

  console.log('\n=== Test Complete ===');
}

// Run tests
testSemanticSearch().catch(console.error);
