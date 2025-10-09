import axios from 'axios';
const healthCheck = async () => {
    try {
        const response = await axios.get('http://localhost:3000/health');
        if (response.status === 200) {
            console.log('✅ Gateway health check passed');
            process.exit(0);
        }
        else {
            console.log('❌ Gateway health check failed');
            process.exit(1);
        }
    }
    catch (error) {
        console.error('❌ Gateway health check error:', error);
        process.exit(1);
    }
};
healthCheck();
//# sourceMappingURL=health-check.js.map