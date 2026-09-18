import LegalDocumentScreen from '../components/LegalDocumentScreen';

export default function PrivacyPolicyScreen(props) {
  return <LegalDocumentScreen {...props} route={{ ...props.route, params: { doc: 'privacy', ...props.route?.params } }} />;
}
