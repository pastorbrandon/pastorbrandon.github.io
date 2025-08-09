// Test script to validate the JSON schema
const testSchema = {
  name: "Test Helm",
  slot: "helm",
  rarity: "Legendary",
  type: "Ancestral Legendary Helm",
  item_power: 925,
  armor: 450,
  aspect: {
    name: "Snowveiled Aspect",
    source: "imprinted",
    text: "You gain 15% increased Movement Speed for 3 seconds after using Evade."
  },
  affixes: [
    {
      stat: "Cooldown Reduction",
      val: 12.5,
      unit: "%",
      greater: false,
      tempered: false
    },
    {
      stat: "Hydra Ranks",
      val: 3,
      unit: null,
      greater: true,
      tempered: false
    }
  ],
  masterwork: {
    rank: 2,
    max: 5
  },
  tempers: {
    used: 1,
    max: 2
  },
  sockets: 1,
  gems: ["Royal Diamond"],
  status: "Blue",
  score: 95,
  reasons: ["Has mandatory affixes", "Good aspect"],
  improvements: ["Complete masterworking"],
  confidence: 0.95
};

// Test the schema validation
function testSchemaValidation() {
  console.log('Testing schema validation...');
  
  // Test that the test data matches the expected structure
  const requiredFields = [
    "name", "slot", "rarity", "type", "aspect", "affixes", 
    "masterwork", "tempers", "sockets", "gems", "status", 
    "score", "reasons", "improvements", "confidence"
  ];
  
  for (const field of requiredFields) {
    if (!(field in testSchema)) {
      console.error(`Missing required field: ${field}`);
      return false;
    }
  }
  
  // Test aspect structure
  if (!testSchema.aspect.name || !testSchema.aspect.source || !testSchema.aspect.text) {
    console.error('Invalid aspect structure');
    return false;
  }
  
  // Test affixes structure
  for (const affix of testSchema.affixes) {
    if (!affix.stat || affix.val === undefined || 
        typeof affix.greater !== 'boolean' || typeof affix.tempered !== 'boolean') {
      console.error('Invalid affix structure:', affix);
      return false;
    }
  }
  
  console.log('Schema validation passed!');
  return true;
}

// Test JSON serialization
function testJsonSerialization() {
  console.log('Testing JSON serialization...');
  
  try {
    const jsonString = JSON.stringify(testSchema);
    const parsed = JSON.parse(jsonString);
    
    if (JSON.stringify(parsed) === JSON.stringify(testSchema)) {
      console.log('JSON serialization passed!');
      return true;
    } else {
      console.error('JSON serialization failed - data mismatch');
      return false;
    }
  } catch (error) {
    console.error('JSON serialization failed:', error);
    return false;
  }
}

// Run tests
function runSchemaTests() {
  console.log('=== Schema Validation Tests ===');
  
  const validationTest = testSchemaValidation();
  const serializationTest = testJsonSerialization();
  
  console.log('\n=== Test Results ===');
  console.log('Validation:', validationTest ? 'PASS' : 'FAIL');
  console.log('Serialization:', serializationTest ? 'PASS' : 'FAIL');
  
  const allPassed = validationTest && serializationTest;
  console.log('\nOverall:', allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
  
  return allPassed;
}

// Export for use
if (typeof window !== 'undefined') {
  window.testSchema = runSchemaTests;
  console.log('Schema tests loaded. Run testSchema() to test.');
}

module.exports = { runSchemaTests, testSchema };
