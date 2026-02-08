/**
 * Example Usage of Presentation Generator Service
 *
 * This file demonstrates how to use the presentation generator
 * to convert damage assessments into professional presentations.
 */

import { generatePresentation, exportPresentationAsMarkdown } from './presentationGeneratorService';
import { DamageAssessment } from './imageAnalysisService';

/**
 * Example 1: Generate a basic presentation from damage assessments
 */
async function basicExample(assessments: DamageAssessment[]) {
  const presentation = await generatePresentation(assessments, {
    propertyAddress: '123 Main St, Richmond, VA 23220',
    repName: 'John Smith',
    repContact: '(804) 555-1234',
    inspectionDate: new Date(),
  });

  console.log('Generated Presentation:', presentation.id);
  console.log('Total Slides:', presentation.slides.length);
  console.log('Severity Score:', presentation.summary.severityScore);
}

/**
 * Example 2: Generate presentation with all features enabled
 */
async function fullFeaturesExample(assessments: DamageAssessment[]) {
  const presentation = await generatePresentation(assessments, {
    propertyAddress: '456 Oak Avenue, Baltimore, MD 21201',
    repName: 'Susan Davis',
    repContact: 'susan@roofer.com',
    inspectionDate: new Date('2024-01-15'),
    includeComparison: true,
    includeTalkingPoints: true,
    focusInsurance: true,
  });

  // Export as markdown for review
  const markdown = exportPresentationAsMarkdown(presentation);
  console.log('Markdown Export:');
  console.log(markdown);
}

/**
 * Example 3: Working with the generated presentation
 */
async function workWithPresentationExample(assessments: DamageAssessment[]) {
  const presentation = await generatePresentation(assessments, {
    propertyAddress: '789 Elm Street, Philadelphia, PA 19103',
    repName: 'Mike Johnson',
    repContact: '(215) 555-9876',
  });

  // Access individual slides
  const introSlide = presentation.slides.find(s => s.type === 'INTRO');
  const damageSlides = presentation.slides.filter(s => s.type === 'DAMAGE');
  const insuranceSlide = presentation.slides.find(s => s.type === 'INSURANCE');

  console.log('Intro Slide Title:', introSlide?.title);
  console.log('Number of Damage Slides:', damageSlides.length);
  console.log('Insurance Talking Points:', insuranceSlide?.talkingPoints);

  // Access summary data
  console.log('Summary:');
  console.log('- Total Photos:', presentation.summary.totalPhotos);
  console.log('- Damage Detected:', presentation.summary.damageDetected);
  console.log('- Severity Score:', presentation.summary.severityScore);
  console.log('- Claim Viability:', presentation.summary.claimViability);
  console.log('- Urgency:', presentation.summary.urgency);
  console.log('- Estimated Scope:', presentation.summary.estimatedScope);
}

/**
 * Example 4: Typical workflow
 */
async function typicalWorkflowExample() {
  // Step 1: Rep uploads photos during inspection
  // (These would come from imageAnalysisService.analyzeRoofImage)

  const mockAssessments: DamageAssessment[] = [
    {
      id: 'assess_1',
      timestamp: new Date(),
      imageUrl: 'data:image/jpeg;base64,...',
      imageName: 'roof_south_side.jpg',
      analysis: {
        damageDetected: true,
        damageType: ['wind', 'hail'],
        severity: 'severe',
        affectedArea: 'South-facing slope, upper ridge area',
        estimatedSize: '150 sq ft (15% of total roof area)',
        recommendations: [
          'File insurance claim immediately',
          'Document shingle manufacturer and age',
          'Photograph entire affected slope for adjuster',
        ],
        urgency: 'high',
        insuranceArguments: [
          'Wind-driven hail damage visible on multiple shingles - covered peril',
          'Granule loss and cracking indicate recent storm damage, not wear',
          'Matching this discontinued shingle requires full slope replacement per IRC R908.3',
        ],
        claimViability: 'strong',
        policyLanguage: 'The covered peril of wind-driven hail has caused functional damage to ridge shingles requiring replacement due to inability to match discontinued product',
      },
      followUpQuestions: [
        'When was the last severe storm in this area?',
        'Do you have the original shingle warranty paperwork?',
      ],
      rawResponse: 'Detailed AI analysis...',
      confidence: 92,
    },
    {
      id: 'assess_2',
      timestamp: new Date(),
      imageUrl: 'data:image/jpeg;base64,...',
      imageName: 'roof_east_gutter.jpg',
      analysis: {
        damageDetected: true,
        damageType: ['wind'],
        severity: 'moderate',
        affectedArea: 'East elevation gutter and edge flashing',
        estimatedSize: '20 linear feet',
        recommendations: [
          'Include gutter damage in insurance claim',
          'Check for water intrusion in fascia board',
        ],
        urgency: 'medium',
        insuranceArguments: [
          'Wind damage to gutter system is covered under dwelling coverage',
          'Separated gutter caused by wind uplift is sudden and accidental',
        ],
        claimViability: 'moderate',
        policyLanguage: 'Wind uplift caused gutter separation requiring repair',
      },
      followUpQuestions: [],
      rawResponse: 'Detailed AI analysis...',
      confidence: 88,
    },
    {
      id: 'assess_3',
      timestamp: new Date(),
      imageUrl: 'data:image/jpeg;base64,...',
      imageName: 'roof_north_slope.jpg',
      analysis: {
        damageDetected: false,
        damageType: [],
        severity: 'minor',
        affectedArea: 'North-facing slope',
        estimatedSize: 'N/A',
        recommendations: ['No immediate action required on this area'],
        urgency: 'low',
        insuranceArguments: [],
        claimViability: 'none',
        policyLanguage: '',
      },
      followUpQuestions: [],
      rawResponse: 'No damage detected in this area',
      confidence: 95,
    },
  ];

  // Step 2: Generate presentation
  const presentation = await generatePresentation(mockAssessments, {
    propertyAddress: '123 Storm Lane, Richmond, VA 23220',
    repName: 'Susan (S21 AI)',
    repContact: 'susan@roofer.com | (804) 555-ROOF',
    inspectionDate: new Date(),
    includeComparison: true,
    includeTalkingPoints: true,
    focusInsurance: true,
  });

  // Step 3: Review slides
  console.log('\n=== GENERATED PRESENTATION ===\n');
  console.log(`Title: ${presentation.title}`);
  console.log(`Slides: ${presentation.slides.length}`);
  console.log(`Severity: ${presentation.summary.severityScore}/100`);
  console.log(`Claim Viability: ${presentation.summary.claimViability}`);

  // Step 4: Export for homeowner
  const markdown = exportPresentationAsMarkdown(presentation);

  // In a real app, you would:
  // - Display slides in a presentation UI
  // - Email markdown to homeowner
  // - Save presentation to job record
  // - Use talking points during in-person presentation

  console.log('\n=== SLIDE BREAKDOWN ===\n');
  presentation.slides.forEach(slide => {
    console.log(`${slide.order}. ${slide.type}: ${slide.title}`);
    if (slide.talkingPoints.length > 0) {
      console.log(`   Talking Points: ${slide.talkingPoints.length}`);
    }
  });

  return presentation;
}

/**
 * Example 5: Using presentation data in UI
 */
function uiIntegrationExample(presentation: any) {
  // Example React component usage:

  /*
  function PresentationViewer({ presentationId }) {
    const [presentation, setPresentation] = useState(null);
    const [currentSlide, setCurrentSlide] = useState(0);

    useEffect(() => {
      const pres = getPresentationById(presentationId);
      setPresentation(pres);
    }, [presentationId]);

    if (!presentation) return <Loading />;

    const slide = presentation.slides[currentSlide];

    return (
      <div className="presentation">
        <div className="slide">
          <h1>{slide.title}</h1>
          {slide.subtitle && <h2>{slide.subtitle}</h2>}

          {slide.imageUrl && (
            <img src={slide.imageUrl} alt={slide.imageName} />
          )}

          <div className="content">
            {slide.content.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>

          <div className="talking-points">
            <h3>Talking Points:</h3>
            <ul>
              {slide.talkingPoints.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </div>

          {slide.insuranceNotes && (
            <div className="insurance-notes">
              <h3>Insurance Notes:</h3>
              <ul>
                {slide.insuranceNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="navigation">
          <button
            onClick={() => setCurrentSlide(s => s - 1)}
            disabled={currentSlide === 0}
          >
            Previous
          </button>
          <span>Slide {currentSlide + 1} of {presentation.slides.length}</span>
          <button
            onClick={() => setCurrentSlide(s => s + 1)}
            disabled={currentSlide === presentation.slides.length - 1}
          >
            Next
          </button>
        </div>

        <div className="summary-panel">
          <h3>Summary</h3>
          <p>Severity: {presentation.summary.severityScore}/100</p>
          <p>Claim Viability: {presentation.summary.claimViability}</p>
          <p>Urgency: {presentation.summary.urgency}</p>
          <p>Scope: {presentation.summary.estimatedScope}</p>
        </div>
      </div>
    );
  }
  */
}

// Run the typical workflow example
typicalWorkflowExample()
  .then(presentation => {
    console.log('\nPresentation generated successfully!');
  })
  .catch(error => {
    console.error('Error generating presentation:', error);
  });
